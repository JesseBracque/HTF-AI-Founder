/**
 * Bevroren contract-waarden voor de POC.
 * Zowel server als extensie importeren deze constanten, zodat grenzen en vaste
 * teksten op één plek staan (zie docs/api-contract.md).
 */

/** Minimum aantal woorden; korter wordt geweigerd (geen modelaanroep). */
export const MIN_WORDS = 150;

/** Maximum aantal woorden; daarna afkappen + limitation. */
export const MAX_WORDS = 3000;

/** Harde limiet in tekens; daarboven weigert de server met 413. */
export const MAX_CHARS = 20_000;

/** POC: 3–5 claims per analyse. */
export const MAX_CLAIMS = 5;
export const MIN_CLAIMS = 3;

/** Alleen Engels in de POC. */
export const SUPPORTED_LANGUAGE = "en";

/** Timeout per Google Fact Check-call. */
export const FACT_CHECK_TIMEOUT_MS = 4_000;

/** Aantal factchecks per claim dat we opvragen. */
export const FACT_CHECK_PAGE_SIZE = 3;

/** Vaste disclaimer, letterlijk in elk resultaat. */
export const DISCLAIMER =
  "Dit is een hulpmiddel en geen oordeel. Lees de bronnen zelf na.";

/** Vaste schaalnotitie, hoort bij elk bias-resultaat. */
export const SCALE_NOTE = "Left/right according to the US political spectrum.";

/** Limitation-tekst bij afkapping. */
export const TRUNCATION_LIMITATION =
  "Analyse gebaseerd op de eerste 3.000 woorden.";

/**
 * Google matcht de gecheckte bewering, niet per se onze formulering. Een
 * factcheck over de tegenbewering kan dus bij een claim terechtkomen.
 */
export const FACTCHECK_POLARITY_LIMITATION =
  "Een gevonden factcheck kan over een tegengestelde formulering van de claim gaan; lees de bron zelf.";

/**
 * Default model; overschrijfbaar met env var LLM_MODEL.
 * Let op: de R33-gateway verwacht een provider-prefix (`anthropic/…`).
 */
export const DEFAULT_MODEL = "anthropic/claude-sonnet-5-5";

/** Google Fact Check Tools API-endpoint. */
export const GOOGLE_FACTCHECK_URL =
  "https://factchecktools.googleapis.com/v1alpha1/claims:search";

/** Rate limit: verzoeken per minuut per client. */
export const RATE_LIMIT_PER_MINUTE = 20;
