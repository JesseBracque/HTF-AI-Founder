import { DISCLAIMER } from "../../../shared/constants";
import { PipelineError } from "../errors";
import { analysisResponseSchema, type AnalysisResponse } from "../schema";
import { analyzeText, configuredModel } from "./analyze";
import { factCheckClaims } from "./factcheck";
import { normalizeOutput } from "./normalize";
import { preprocess } from "./preprocess";

/** `anthropic/claude-sonnet-5-5` → `claude-sonnet-5-5` voor meta.model. */
function displayModel(modelId: string): string {
  const index = modelId.lastIndexOf("/");
  return index === -1 ? modelId : modelId.slice(index + 1);
}

/**
 * Volledige pipeline: preprocess → één modelaanroep → normaliseren →
 * factchecks parallel → contractvalidatie.
 */
export async function runPipeline(rawText: string): Promise<AnalysisResponse> {
  const pre = preprocess(rawText);
  const modelOutput = await analyzeText(pre.text);
  const normalized = normalizeOutput(modelOutput);
  const factchecked = await factCheckClaims(normalized.claims);

  const limitations = [
    ...pre.limitations,
    ...normalized.limitations,
    ...factchecked.limitations,
    "Model kan fouten maken.",
  ];

  const candidate = {
    bias: normalized.bias,
    claims: factchecked.claims,
    limitations: [...new Set(limitations)],
    disclaimer: DISCLAIMER,
    meta: {
      model: displayModel(configuredModel()),
      analyzed_words: pre.words,
      truncated: pre.truncated,
    },
  };

  const parsed = analysisResponseSchema.safeParse(candidate);
  if (!parsed.success) {
    // Alleen pad en code loggen — nooit paginatekst.
    console.error(
      JSON.stringify({
        event: "schema_invalid",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          code: issue.code,
        })),
      }),
    );
    throw new PipelineError(
      "invalid_response",
      "Server produceerde een response die niet aan het schema voldoet.",
    );
  }

  return parsed.data;
}
