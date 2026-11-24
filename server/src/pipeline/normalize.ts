import { MAX_CLAIMS, SCALE_NOTE } from "../../../shared/constants";
import type { ModelOutput } from "../schema";
import type { BiasAnalysis } from "../schema";

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Claim zoals het model hem aanlevert, met interne zoekterm voor Google. */
export interface ExtractedClaim {
  text: string;
  searchQuery: string;
}

export interface NormalizedOutput {
  bias: BiasAnalysis;
  claims: ExtractedClaim[];
  limitations: string[];
}

/** Maximaal aantal woorden in een zoekterm; langer matcht Google slecht. */
const MAX_QUERY_WORDS = 8;

/**
 * Schoont de zoekterm op: geen aanhalingstekens of zoekoperatoren, hooguit
 * {@link MAX_QUERY_WORDS} woorden. Leeg → terugvallen op de claimtekst.
 */
export function cleanSearchQuery(query: string, claimText: string): string {
  const cleaned = query
    .replace(/["“”‘’`]/g, " ")
    .replace(/(^|\s)[-+](?=\S)/g, "$1")
    .replace(/\b(?:AND|OR|NOT)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(" ").filter(Boolean).slice(0, MAX_QUERY_WORDS);
  return words.length > 0 ? words.join(" ") : claimText;
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

  let claims: ExtractedClaim[] = output.claims
    .map((claim) => {
      const text = cleanText(claim.text);
      return { text, searchQuery: cleanSearchQuery(claim.search_query, text) };
    })
    .filter((claim) => claim.text.length > 0);

  // Dedupe (hoofdletterongevoelig), behoud volgorde.
  const seen = new Set<string>();
  claims = claims.filter((claim) => {
    const key = claim.text.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (claims.length > MAX_CLAIMS) {
    claims = claims.slice(0, MAX_CLAIMS);
  }

  if (label === "not_political") {
    claims = [];
  } else if (claims.length === 0) {
    limitations.push(
      "Geen controleerbare claims gevonden; de factcheck-stap is overgeslagen.",
    );
  } else if (claims.length < 3) {
    limitations.push(
      `Model vond minder dan 3 controleerbare claims (${claims.length}).`,
    );
  }

  const bias: BiasAnalysis = {
    label,
    confidence,
    explanation: explanation || "Geen uitleg gegeven.",
    evidence,
    scale_note: SCALE_NOTE,
  };

  return { bias, claims, limitations };
}
