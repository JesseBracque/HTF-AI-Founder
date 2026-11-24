import { franc } from "franc";
import {
  MAX_CHARS,
  MAX_WORDS,
  MIN_WORDS,
  TRUNCATION_LIMITATION,
} from "../../../shared/constants";
import { PipelineError } from "../errors";

export interface PreprocessResult {
  text: string;
  words: number;
  truncated: boolean;
  limitations: string[];
}

const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+/gi;

/**
 * Best-effort verwijderen van uitgeveraanduidingen die de extensie zelf al
 * niet meestuurt, maar die in geplakte tekst kunnen zitten: URL's, bylines en
 * "Published/Updated"-regels. Bewust conservatief: alleen korte, duidelijke
 * regels, zodat normale zinnen niet verdwijnen.
 */
export function stripPublisherMetadata(raw: string): string {
  let text = raw.replace(/\r\n/g, "\n");

  text = text.replace(URL_PATTERN, " ");

  // "By Jane Doe", "Written by ...", "Reporting by ..." — korte regel zonder punt.
  text = text.replace(
    /^[ \t]*(?:by|written by|reporting by|posted by)[ \t]+[A-Z][\p{L}.'’\- ]{2,60}[ \t]*$/gimu,
    "",
  );

  // "Published ...", "Updated ...", "Last updated ..." — korte regel.
  text = text.replace(
    /^[ \t]*(?:published|updated|last updated)\b[^\n]{0,80}$/gimu,
    "",
  );

  return text
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function countWords(text: string): number {
  return (text.match(/\S+/g) ?? []).length;
}

function truncateToWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ");
}

/** ISO 639-3-code volgens franc ("eng", "nld", ...). */
export function detectLanguage(text: string): string {
  return franc(text, { minLength: 20 });
}

/**
 * Volgorde (volgens CLAUDE.md §4):
 * 1. harde tekengrens, 2. uitgever/URL/byline strippen, 3. minimum woorden,
 * 4. afkappen op 3.000 woorden, 5. taaldetectie op de afgekapte tekst.
 */
export function preprocess(raw: string): PreprocessResult {
  if (raw.length > MAX_CHARS) {
    throw new PipelineError(
      "too_long",
      `Tekst is te lang: ${raw.length} tekens (maximum ${MAX_CHARS}).`,
    );
  }

  const stripped = stripPublisherMetadata(raw);
  const rawWords = countWords(stripped);

  if (rawWords < MIN_WORDS) {
    throw new PipelineError(
      "too_short",
      `Tekst is te kort om te analyseren: ${rawWords} woorden (minimum ${MIN_WORDS}).`,
    );
  }

  const truncated = rawWords > MAX_WORDS;
  const text = truncated ? truncateToWords(stripped, MAX_WORDS) : stripped;
  const words = countWords(text);

  const language = detectLanguage(text);
  if (language !== "eng") {
    throw new PipelineError(
      "not_english",
      `Alleen Engelse pagina's worden ondersteund (gedetecteerd: ${language}).`,
    );
  }

  const limitations: string[] = [];
  if (truncated) limitations.push(TRUNCATION_LIMITATION);

  return { text, words, truncated, limitations };
}
