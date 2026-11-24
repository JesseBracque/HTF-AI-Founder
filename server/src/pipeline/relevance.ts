import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { RELEVANCE_TIMEOUT_MS } from "../../../shared/constants";
import { RELEVANCE_SYSTEM_PROMPT, buildRelevancePrompt } from "../prompts/relevance";
import { RelevanceOutputSchema } from "../schema";
import { configuredModel, getClient, mapSdkError } from "./analyze";
import type { RelevanceItem } from "./factcheck";

const MAX_TOKENS = 1200;

/**
 * Tweede, kleine modelaanroep: per kandidaat-factcheck of die over dezelfde
 * specifieke bewering gaat als onze claim. Korte zoektermen geven bij Google
 * veel meer treffers, maar ook treffers over iets anders; die vallen hier af.
 *
 * Geeft de id's van relevante kandidaten terug, of `null` als de controle
 * mislukte (de aanroeper toont dan ongefilterd met een limitation). Id's die
 * het model weglaat of verzint, tellen als niet relevant.
 */
export async function judgeRelevance(items: RelevanceItem[]): Promise<Set<string> | null> {
  const knownIds = new Set(items.flatMap((item) => item.candidates.map((c) => c.id)));
  if (knownIds.size === 0) return new Set();

  try {
    const response = await getClient().messages.parse(
      {
        model: configuredModel(),
        max_tokens: MAX_TOKENS,
        system: RELEVANCE_SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildRelevancePrompt(items) }],
        output_config: {
          effort: "low",
          format: zodOutputFormat(RelevanceOutputSchema),
        },
      },
      { timeout: RELEVANCE_TIMEOUT_MS },
    );

    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
      console.error(JSON.stringify({ event: "relevance_failed", reason: response.stop_reason }));
      return null;
    }
    if (!response.parsed_output) {
      console.error(JSON.stringify({ event: "relevance_failed", reason: "no_parsed_output" }));
      return null;
    }

    return new Set(
      response.parsed_output.verdicts
        .filter((verdict) => verdict.addresses_claim && knownIds.has(verdict.id))
        .map((verdict) => verdict.id),
    );
  } catch (error) {
    // Alleen onze eigen foutcode/-melding loggen — nooit claim- of paginatekst.
    const mapped = mapSdkError(error);
    console.error(
      JSON.stringify({ event: "relevance_failed", code: mapped.code, message: mapped.message }),
    );
    return null;
  }
}
