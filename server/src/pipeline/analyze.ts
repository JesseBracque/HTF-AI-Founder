import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { DEFAULT_MODEL } from "../../../shared/constants";
import { PipelineError } from "../errors";
import { SYSTEM_PROMPT, buildUserPrompt } from "../prompts/codebook";
import { ModelOutputSchema, type ModelOutput } from "../schema";

/** POC-budget per analyse (zie docs/POC-PLAN.md). */
const MAX_TOKENS = 1600;
const EFFORT = "low" as const;

export function configuredModel(): string {
  return process.env.LLM_MODEL || DEFAULT_MODEL;
}

function getClient(): Anthropic {
  const apiKey = process.env.R33_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new PipelineError(
      "upstream_error",
      "Server heeft geen API-key (R33_API_KEY of ANTHROPIC_API_KEY).",
    );
  }
  return new Anthropic({
    apiKey,
    baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
    timeout: 60_000,
    maxRetries: 0, // retry doen we zelf, bewust maar één keer
  });
}

/** Vertaalt SDK-fouten naar contractcodes; nooit op foutstrings matchen. */
function mapSdkError(error: unknown): PipelineError {
  if (error instanceof PipelineError) return error;

  if (error instanceof Anthropic.AuthenticationError) {
    return new PipelineError("upstream_error", "Authenticatie bij de AI-gateway mislukt.");
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new PipelineError(
      "upstream_error",
      "De AI-gateway weigert dit model of deze key (403).",
    );
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new PipelineError("upstream_error", "AI-gateway gaf een rate limit (429).");
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new PipelineError("upstream_error", `AI-gateway weigerde het verzoek (400): ${error.message}`);
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new PipelineError("upstream_error", "AI-gateway reageerde niet op tijd.");
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new PipelineError("upstream_error", "Kon de AI-gateway niet bereiken.");
  }
  if (error instanceof Anthropic.APIError) {
    return new PipelineError(
      "upstream_error",
      `AI-gateway gaf een fout (${error.status ?? "onbekend"}).`,
    );
  }
  return new PipelineError("upstream_error", "Onverwachte fout bij de modelaanroep.");
}

async function callModel(
  client: Anthropic,
  model: string,
  text: string,
): Promise<ModelOutput> {
  const response = await client.messages.parse({
    model,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(text) }],
    output_config: {
      effort: EFFORT,
      format: zodOutputFormat(ModelOutputSchema),
    },
  });

  if (response.stop_reason === "refusal") {
    throw new PipelineError(
      "upstream_error",
      "Het model weigerde deze tekst te analyseren.",
    );
  }
  if (response.stop_reason === "max_tokens") {
    throw new PipelineError(
      "invalid_response",
      "Modeloutput werd afgekapt (max_tokens); resultaat is onvolledig.",
    );
  }
  if (!response.parsed_output) {
    throw new PipelineError(
      "invalid_response",
      "Model gaf geen schema-geldige JSON terug.",
    );
  }
  return response.parsed_output;
}

/**
 * Eén modelaanroep voor bias + claims. Bij een ongeldige/onparseerbare respons
 * precies één nieuwe poging; andere fouten gaan direct door.
 */
export async function analyzeText(text: string): Promise<ModelOutput> {
  const client = getClient();
  const model = configuredModel();

  try {
    return await callModel(client, model, text);
  } catch (firstError) {
    const mapped = mapSdkError(firstError);
    if (mapped.code !== "invalid_response") throw mapped;

    try {
      return await callModel(client, model, text);
    } catch (secondError) {
      const mappedSecond = mapSdkError(secondError);
      throw new PipelineError(
        "invalid_response",
        mappedSecond.code === "invalid_response"
          ? "Model gaf twee keer geen geldige JSON terug."
          : mappedSecond.message,
      );
    }
  }
}
