/**
 * Contracttypes. De bron van waarheid staat in `shared/types.ts` op main;
 * de extensie hergebruikt die types zodat server en extensie niet uit elkaar
 * lopen. Het gaat om type-only imports: er komt geen servercode mee in de
 * bundel.
 */
export type {
  AnalysisMeta,
  AnalysisResponse as AnalysisResult,
  ApiError as ApiErrorBody,
  BiasAnalysis,
  BiasEvidence,
  BiasLabel,
  Claim,
  ClaimStatus,
  ErrorCode as ApiErrorCode,
  FactCheck as Factcheck,
  SourceType,
} from "../../shared/types";

/** Antwoord van het content script op een EXTRACT-bericht. */
export type ExtractResponse =
  | { ok: true; text: string }
  | { ok: false; reason: "empty" | "error" };
