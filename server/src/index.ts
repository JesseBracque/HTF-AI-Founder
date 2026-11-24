import "./env";
import http from "node:http";
import {
  MAX_CHARS,
  RATE_LIMIT_PER_MINUTE,
} from "../../shared/constants";
import { PipelineError } from "./errors";
import { runPipeline } from "./pipeline";
import { analyzeRequestSchema } from "./schema";
import { configuredModel } from "./pipeline/analyze";

const PORT = Number(process.env.PORT || 3000);

/** Ruime bovengrens voor de JSON-body; de echte grens (20.000 tekens) zit in de pipeline. */
const BODY_LIMIT_BYTES = Math.max(64 * 1024, MAX_CHARS * 2);

function json(res: http.ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  res.end(body);
}

/** CORS alleen voor de extensie (`chrome-extension://…`). */
function applyCors(req: http.IncomingMessage, res: http.ServerResponse): void {
  const origin = req.headers.origin;
  if (typeof origin === "string" && origin.startsWith("chrome-extension://")) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    res.setHeader("Access-Control-Max-Age", "600");
  }
  res.setHeader("Vary", "Origin");
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > BODY_LIMIT_BYTES) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) {
        reject(new PipelineError("too_long", "Request-body is te groot."));
        return;
      }
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", () => {
      reject(new PipelineError("bad_request", "Kon request-body niet lezen."));
    });
  });
}

// --- Rate limit (in-memory, per client, 20/min) ---

interface RateEntry {
  count: number;
  resetAt: number;
}

const rateHits = new Map<string, RateEntry>();

function clientKey(req: http.IncomingMessage): string {
  // Achter Traefik is remoteAddress de proxy; gebruik X-Forwarded-For.
  const forwarded = req.headers["x-forwarded-for"];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const fromHeader = first?.split(",")[0]?.trim();
  return fromHeader || req.socket.remoteAddress || "unknown";
}

function checkRateLimit(key: string): void {
  const now = Date.now();

  if (rateHits.size > 5000) {
    for (const [entryKey, entry] of rateHits) {
      if (now > entry.resetAt) rateHits.delete(entryKey);
    }
  }

  const entry = rateHits.get(key);
  if (!entry || now > entry.resetAt) {
    rateHits.set(key, { count: 1, resetAt: now + 60_000 });
    return;
  }

  entry.count += 1;
  if (entry.count > RATE_LIMIT_PER_MINUTE) {
    throw new PipelineError(
      "rate_limited",
      `Te veel verzoeken (max ${RATE_LIMIT_PER_MINUTE}/minuut). Probeer over een minuut opnieuw.`,
    );
  }
}

// --- Handlers ---

function sendError(res: http.ServerResponse, error: unknown): void {
  if (error instanceof PipelineError) {
    if (!res.headersSent) {
      json(res, error.status, { error: { code: error.code, message: error.message } });
    }
    return;
  }

  // Geen paginatekst loggen: alleen de foutsoort.
  console.error(
    JSON.stringify({
      event: "unexpected_error",
      message: error instanceof Error ? error.message : "onbekend",
    }),
  );
  if (!res.headersSent) {
    json(res, 502, {
      error: { code: "upstream_error", message: "Onverwachte serverfout." },
    });
  }
}

async function handleAnalyze(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  checkRateLimit(clientKey(req));

  const body = await readBody(req);

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new PipelineError("bad_request", "Body is geen geldige JSON.");
  }

  const parsed = analyzeRequestSchema.safeParse(payload);
  if (!parsed.success) {
    throw new PipelineError(
      "bad_request",
      'Body moet een object zijn met een niet-lege string "text".',
    );
  }

  const started = Date.now();
  const result = await runPipeline(parsed.data.text);
  const elapsedMs = Date.now() - started;

  console.log(
    JSON.stringify({
      event: "analyze",
      ok: true,
      label: result.bias.label,
      confidence: result.bias.confidence,
      claims: result.claims.length,
      factchecks: result.claims.reduce((sum, claim) => sum + claim.factchecks.length, 0),
      words: result.meta.analyzed_words,
      truncated: result.meta.truncated,
      model: result.meta.model,
      ms: elapsedMs,
    }),
  );

  json(res, 200, result);
}

const server = http.createServer((req, res) => {
  applyCors(req, res);

  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && pathname === "/health") {
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && pathname === "/analyze") {
    handleAnalyze(req, res).catch((error) => sendError(res, error));
    return;
  }

  json(res, 404, {
    error: { code: "bad_request", message: `Onbekend pad: ${req.method} ${pathname}` },
  });
});

server.listen(PORT, () => {
  console.log(
    JSON.stringify({ event: "start", port: PORT, model: configuredModel() }),
  );
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
