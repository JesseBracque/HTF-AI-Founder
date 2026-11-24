/**
 * Bevroren contract tussen server en extensie (POC).
 * De server valideert zijn output met zod (server/src/schema.ts); de extensie
 * importeert deze types. Houd beide in lijn met docs/api-contract.md.
 */

export type BiasLabel =
  | "left"
  | "center"
  | "right"
  | "not_political"
  | "uncertain";

export interface BiasEvidence {
  /** Letterlijk citaat uit de aangeleverde tekst. */
  quote: string;
  /** Waarom dit citaat op het label wijst. */
  reason: string;
}

export interface BiasAnalysis {
  label: BiasLabel;
  /** 0..1 */
  confidence: number;
  /** Korte, neutrale uitleg. */
  explanation: string;
  evidence: BiasEvidence[];
  /** Vaste tekst: "Left/right according to the US political spectrum." */
  scale_note: string;
}

export type ClaimStatus = "factcheck_found" | "no_factcheck_found";

export type SourceType = "factchecker" | "news_media";

export interface FactCheck {
  /** Uitgever, bv. "PolitiFact". */
  publisher: string;
  /** Domein, bv. "politifact.com". */
  publisher_site: string;
  /** Letterlijke rating van de factchecker (niet genormaliseerd). */
  rating_text: string;
  title: string;
  url: string;
  /** ISO-datum (YYYY-MM-DD), optioneel. */
  review_date?: string;
  source_type: SourceType;
}

export interface Claim {
  /** Controleerbare bewering uit de tekst. */
  text: string;
  status: ClaimStatus;
  factchecks: FactCheck[];
}

export interface AnalysisMeta {
  model: string;
  analyzed_words: number;
  truncated: boolean;
}

export interface AnalysisResponse {
  bias: BiasAnalysis;
  claims: Claim[];
  limitations: string[];
  disclaimer: string;
  meta: AnalysisMeta;
}

/**
 * Foutcodes. De eerste vijf staan in het bevroren contract; `bad_request` en
 * `rate_limited` zijn POC-aanvullingen (zie docs/api-contract.md).
 */
export type ErrorCode =
  | "too_short"
  | "not_english"
  | "too_long"
  | "invalid_response"
  | "upstream_error"
  | "bad_request"
  | "rate_limited";

export interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
  };
}

/** Request-body van POST /analyze. */
export interface AnalyzeRequest {
  text: string;
}
