/**
 * R2 — Gateway-smoketest.
 *
 * Doel: vóór we de pipeline bouwen controleren dat de R33-gateway
 *  1. onze key accepteert,
 *  2. `claude-sonnet-5-5` kent (let op: gateway verwacht `anthropic/…`),
 *  3. structured outputs ondersteunt (`output_config.format`),
 *  4. `output_config.effort: "low"` accepteert.
 *
 * Draai met:  npm run smoke        (vanuit server/)
 * Vereist:    R33_API_KEY (of ANTHROPIC_API_KEY) in de omgeving of in de root-.env.
 */
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Root-.env laden (server draait vanuit server/, .env staat in de repo-root).
const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, "../../.env"), quiet: true });

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const MiniSchema = z.object({
  label: z.enum(["left", "center", "right", "not_political", "uncertain"]),
  confidence: z.number().min(0).max(1),
  explanation: z.string(),
});

const apiKey = process.env.R33_API_KEY || process.env.ANTHROPIC_API_KEY;
const baseURL = process.env.ANTHROPIC_BASE_URL || undefined;
const model = process.env.LLM_MODEL || "anthropic/claude-sonnet-5-5";

if (!apiKey) {
  console.error(
    "FOUT: geen R33_API_KEY of ANTHROPIC_API_KEY gevonden (omgeving of root-.env).",
  );
  process.exit(1);
}

const client = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) });

const sample =
  "Our borders were left wide open by the previous administration, and the " +
  "American people paid the price. This bill finally puts agents back on the " +
  "line and sends a clear message that the rule of law still matters.";

console.log(`gateway : ${baseURL ?? "(default Anthropic)"}`);
console.log(`model   : ${model}`);
console.log("aanroep : messages.parse + zodOutputFormat + effort low …\n");

const started = Date.now();

try {
  const response = await client.messages.parse({
    model,
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content:
          "Classify the political framing of the following text on the US " +
          "left/right spectrum. Quote nothing; explain briefly.\n\n" +
          `"""${sample}"""`,
      },
    ],
    output_config: {
      effort: "low",
      format: zodOutputFormat(MiniSchema),
    },
  });

  const ms = Date.now() - started;
  console.log(`HTTP ok, ${ms} ms`);
  console.log(`response.model : ${response.model}`);
  console.log(`stop_reason    : ${response.stop_reason}`);
  console.log(`usage          : ${JSON.stringify(response.usage)}`);

  if (response.stop_reason === "refusal") {
    console.error("FOUT: model weigerde (stop_reason=refusal).");
    process.exit(2);
  }
  if (response.stop_reason === "max_tokens") {
    console.error("FOUT: output afgekapt (stop_reason=max_tokens), max_tokens te laag.");
    process.exit(2);
  }
  if (!response.parsed_output) {
    console.error(
      "FOUT: structured output niet geparsed. Ruwe content:\n" +
        JSON.stringify(response.content, null, 2),
    );
    process.exit(2);
  }

  console.log("parsed_output  :", response.parsed_output);
  console.log("\nGESLAAGD: gateway doet structured outputs met effort=low.");
} catch (error) {
  if (error instanceof Anthropic.AuthenticationError) {
    console.error("FOUT: authenticatie mislukt (401). Controleer R33_API_KEY.");
  } else if (error instanceof Anthropic.PermissionDeniedError) {
    console.error(
      "FOUT: 403 — de gateway kent dit model niet of de key mag het niet gebruiken. " +
        "Probeer een provider-prefix, bv. anthropic/claude-sonnet-5-5.",
    );
  } else if (error instanceof Anthropic.RateLimitError) {
    console.error("FOUT: rate limit (429). Probeer later opnieuw.");
  } else if (error instanceof Anthropic.BadRequestError) {
    console.error(`FOUT: 400 — ${error.message}`);
  } else if (error instanceof Anthropic.APIError) {
    console.error(`FOUT: API ${error.status} — ${error.message}`);
  } else {
    console.error("FOUT:", error);
  }
  process.exit(1);
}
