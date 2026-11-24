/**
 * Types van het contract tussen proxy en extensie.
 * Zie docs/POC-PLAN.md en CLAUDE.md §5. De server is de bron van waarheid;
 * deze kopie bestaat omdat de extensie niet van server-code mag importeren.
 */

export type BiasLabel = "left" | "center" | "right" | "not_political" | "uncertain";

export interface BiasEvidence {
  quote: string;
  reason: string;
}

export interface BiasAnalysis {
  label: BiasLabel;
  /** 0..1 */
  confidence: number;
  explanation: string;
  /** Letterlijke citaten uit de tekst. */
  evidence: BiasEvidence[];
  /** Vaste tekst: "Left/right according to the US political spectrum." */
  scale_note: string;
}

export interface Factcheck {
  /** Bijv. "PolitiFact". */
  publisher: string;
  /** Domein, bijv. "politifact.com". */
  publisher_site: string;
  /** Letterlijke rating van de factchecker, niet genormaliseerd. */
  rating_text: string;
  title: string;
  url: string;
  review_date?: string;
  source_type: "factchecker" | "news_media";
}

export interface Claim {
  text: string;
  status: "factcheck_found" | "no_factcheck_found";
  factchecks: Factcheck[];
}

export interface AnalysisMeta {
  model: string;
  analyzed_words: number;
  truncated: boolean;
}

export interface AnalysisResult {
  bias: BiasAnalysis;
  claims: Claim[];
  limitations: string[];
  disclaimer: string;
  meta: AnalysisMeta;
}

export type ApiErrorCode =
  | "too_short"
  | "not_english"
  | "too_long"
  | "invalid_response"
  | "upstream_error";

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
  };
}

/** Antwoord van het content script op een EXTRACT-bericht. */
export type ExtractResponse =
  | { ok: true; text: string }
  | { ok: false; reason: "empty" | "error" };
