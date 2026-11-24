/**
 * Client voor de proxy: POST /analyze met alleen de paginatekst.
 */
import mockAnalysis from "./mock/analysis-result.json";
import type {
  AnalysisResult,
  ApiErrorBody,
  ApiErrorCode,
  BiasLabel,
} from "./types";

export const USE_MOCK = import.meta.env.VITE_USE_MOCK === "1";

/** ApiErrorCode aangevuld met een lokale code voor netwerk-/time-outfouten. */
export type AnalyzeErrorCode = ApiErrorCode | "network_error";

export class AnalyzeApiError extends Error {
  readonly code: AnalyzeErrorCode;

  constructor(code: AnalyzeErrorCode, message: string) {
    super(message);
    this.name = "AnalyzeApiError";
    this.code = code;
  }
}

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080"
).replace(/\/+$/, "");

/** Ruime marge boven het streefdoel van ~10 s; de server doet één LLM-call. */
const REQUEST_TIMEOUT_MS = 45_000;

const BIAS_LABELS: readonly BiasLabel[] = [
  "left",
  "center",
  "right",
  "not_political",
  "uncertain",
];

const API_ERROR_CODES: readonly ApiErrorCode[] = [
  "too_short",
  "not_english",
  "too_long",
  "invalid_response",
  "upstream_error",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Lichte runtime-controle op het antwoord. De server valideert met zod; dit
 * voorkomt vooral dat de popup crasht op een onverwacht antwoord.
 */
function isAnalysisResult(value: unknown): value is AnalysisResult {
  if (!isRecord(value) || !isRecord(value.bias)) {
    return false;
  }
  const bias = value.bias;
  return (
    BIAS_LABELS.includes(bias.label as BiasLabel) &&
    typeof bias.confidence === "number" &&
    Number.isFinite(bias.confidence) &&
    typeof bias.explanation === "string" &&
    Array.isArray(bias.evidence) &&
    typeof bias.scale_note === "string" &&
    Array.isArray(value.claims) &&
    Array.isArray(value.limitations) &&
    typeof value.disclaimer === "string" &&
    isRecord(value.meta) &&
    typeof value.meta.model === "string"
  );
}

function readApiError(body: unknown): ApiErrorBody["error"] | undefined {
  if (!isRecord(body) || !isRecord(body.error)) {
    return undefined;
  }
  const { code, message } = body.error;
  if (
    typeof code !== "string" ||
    !API_ERROR_CODES.includes(code as ApiErrorCode) ||
    typeof message !== "string"
  ) {
    return undefined;
  }
  return { code: code as ApiErrorCode, message };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function analyzeText(text: string): Promise<AnalysisResult> {
  if (USE_MOCK) {
    await delay(500);
    return mockAnalysis as AnalysisResult;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // Alleen tekst: geen titel, auteur, URL of domein.
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const isTimeout =
      error instanceof DOMException && error.name === "TimeoutError";
    throw new AnalyzeApiError(
      "network_error",
      isTimeout
        ? "De server reageerde niet binnen de tijd."
        : "De server is niet bereikbaar.",
    );
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Geen JSON: behandel als ongeldig antwoord.
  }

  if (!response.ok) {
    const apiError = readApiError(body);
    throw new AnalyzeApiError(
      apiError?.code ?? "upstream_error",
      apiError?.message ?? `HTTP ${response.status}`,
    );
  }

  if (!isAnalysisResult(body)) {
    throw new AnalyzeApiError(
      "invalid_response",
      "De server gaf een onverwacht antwoordformaat.",
    );
  }

  return body;
}
