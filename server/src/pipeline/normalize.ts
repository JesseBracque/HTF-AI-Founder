import { MAX_CLAIMS, SCALE_NOTE } from "../../../shared/constants";
import type { ModelOutput } from "../schema";
import type { BiasAnalysis, Claim } from "../schema";

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export interface NormalizedOutput {
  bias: BiasAnalysis;
  claims: Claim[];
  limitations: string[];
}

/**
 * Maakt de modeloutput contract-conform: confidence clampen, citaten/claims
 * opschonen, maximum respecteren, `not_political` → geen claims.
 */
export function normalizeOutput(output: ModelOutput): NormalizedOutput {
  const limitations: string[] = [];

  const evidence = output.bias.evidence
    .map((item) => ({
      quote: cleanText(item.quote),
      reason: cleanText(item.reason),
    }))
    .filter((item) => item.quote.length > 0 && item.reason.length > 0)
    .slice(0, 3);

  if (evidence.length === 0) {
    limitations.push("Geen citaten als onderbouwing gevonden.");
  }

  const explanation = cleanText(output.bias.explanation);
  if (!explanation) {
    limitations.push("Model gaf geen uitleg bij het bias-label.");
  }

  const label = output.bias.label;
  const confidence = clamp01(output.bias.confidence);

  if (confidence < 0.6 && explanation.length < 80) {
    limitations.push(
      "Model is onzeker over het bias-label, maar gaf een korte uitleg.",
    );
  }

  let claimTexts = output.claims
    .map(cleanText)
    .filter((text) => text.length > 0);

  // Dedupe (hoofdletterongevoelig), behoud volgorde.
  const seen = new Set<string>();
  claimTexts = claimTexts.filter((text) => {
    const key = text.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (claimTexts.length > MAX_CLAIMS) {
    claimTexts = claimTexts.slice(0, MAX_CLAIMS);
  }

  if (label === "not_political") {
    claimTexts = [];
  } else if (claimTexts.length === 0) {
    limitations.push(
      "Geen controleerbare claims gevonden; de factcheck-stap is overgeslagen.",
    );
  } else if (claimTexts.length < 3) {
    limitations.push(
      `Model vond minder dan 3 controleerbare claims (${claimTexts.length}).`,
    );
  }

  const bias: BiasAnalysis = {
    label,
    confidence,
    explanation: explanation || "Geen uitleg gegeven.",
    evidence,
    scale_note: SCALE_NOTE,
  };

  const claims: Claim[] = claimTexts.map((text) => ({
    text,
    status: "no_factcheck_found",
    factchecks: [],
  }));

  return { bias, claims, limitations };
}
