import { z } from "zod";
import { DISCLAIMER, SCALE_NOTE } from "../../shared/constants";

/**
 * zod-schema's = enige bron van waarheid voor de output.
 *
 * - `ModelOutputSchema`: wat het model teruggeeft via structured outputs.
 *   Bewust zonder numerieke bounds of array-lengths: het JSON-schema voor
 *   structured outputs ondersteunt die niet betrouwbaar. We normaliseren en
 *   valideren daarna in `normalize.ts`.
 * - `AnalysisResponseSchema`: het volledige contract dat de deur uit gaat.
 */

export const biasLabelSchema = z.enum([
  "left",
  "center",
  "right",
  "not_political",
  "uncertain",
]);

export const biasEvidenceSchema = z.object({
  quote: z.string(),
  reason: z.string(),
});

export const ModelOutputSchema = z.object({
  bias: z.object({
    label: biasLabelSchema,
    confidence: z.number(),
    explanation: z.string(),
    evidence: z.array(biasEvidenceSchema),
  }),
  claims: z.array(
    z.object({
      text: z.string(),
      /** 3–6 trefwoorden voor Google Fact Check; intern, niet in het contract. */
      search_query: z.string(),
    }),
  ),
});

export type ModelOutput = z.infer<typeof ModelOutputSchema>;

/**
 * Relevantiecontrole (tweede, kleine modelaanroep): per kandidaat-factcheck
 * of die over dezelfde specifieke bewering gaat. Bevat bewust geen rating.
 */
export const RelevanceOutputSchema = z.object({
  verdicts: z.array(
    z.object({
      id: z.string(),
      addresses_claim: z.boolean(),
    }),
  ),
});

export type RelevanceOutput = z.infer<typeof RelevanceOutputSchema>;

export const factCheckSchema = z.object({
  publisher: z.string().min(1),
  publisher_site: z.string().min(1),
  rating_text: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url(),
  review_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  source_type: z.enum(["factchecker", "news_media"]),
});

export const claimSchema = z.object({
  text: z.string().min(1),
  status: z.enum(["factcheck_found", "no_factcheck_found"]),
  factchecks: z.array(factCheckSchema),
});

export const biasAnalysisSchema = z.object({
  label: biasLabelSchema,
  confidence: z.number().min(0).max(1),
  explanation: z.string().min(1),
  evidence: z.array(biasEvidenceSchema),
  scale_note: z.literal(SCALE_NOTE),
});

export const analysisResponseSchema = z.object({
  bias: biasAnalysisSchema,
  claims: z.array(claimSchema),
  limitations: z.array(z.string()),
  disclaimer: z.literal(DISCLAIMER),
  meta: z.object({
    model: z.string(),
    analyzed_words: z.number().int().nonnegative(),
    truncated: z.boolean(),
  }),
});

/** Request-body van POST /analyze. */
export const analyzeRequestSchema = z.object({
  text: z.string().min(1),
});

export type AnalysisResponse = z.infer<typeof analysisResponseSchema>;
export type BiasAnalysis = z.infer<typeof biasAnalysisSchema>;
export type Claim = z.infer<typeof claimSchema>;
export type FactCheck = z.infer<typeof factCheckSchema>;
