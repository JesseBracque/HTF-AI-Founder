import {
  FACTCHECK_POLARITY_LIMITATION,
  FACT_CHECK_PAGE_SIZE,
  FACT_CHECK_TIMEOUT_MS,
  GOOGLE_FACTCHECK_URL,
  MAX_FACTCHECKS_PER_CLAIM,
  MAX_FACTCHECK_CANDIDATES,
  RELEVANCE_FAILED_LIMITATION,
} from "../../../shared/constants";
import type { Claim, FactCheck } from "../schema";
import type { ExtractedClaim } from "./normalize";
import { judgeRelevance } from "./relevance";

interface GoogleClaimReview {
  publisher?: { name?: string; site?: string };
  url?: string;
  title?: string;
  reviewDate?: string;
  textualRating?: string;
  languageCode?: string;
}

interface GoogleClaim {
  text?: string;
  claimReview?: GoogleClaimReview[];
}

interface GoogleResponse {
  claims?: GoogleClaim[];
}

/**
 * Eén bewering die een factchecker controleerde (Google `claims[]`-item), met
 * de factchecks daarover. De relevantiecontrole beslist per kandidaat of hij
 * bij onze claim hoort.
 */
export interface FactCheckCandidate {
  /** Uniek binnen één analyse, bv. `c0-k2`. */
  id: string;
  /** De bewering zoals de factchecker die formuleerde (kan leeg zijn). */
  checkedClaim: string;
  factchecks: FactCheck[];
}

export interface RelevanceItem {
  claim: string;
  candidates: FactCheckCandidate[];
}

/**
 * Geeft de id's terug van kandidaten die over dezelfde specifieke bewering
 * gaan, of `null` als de controle mislukte.
 */
export type RelevanceJudge = (items: RelevanceItem[]) => Promise<Set<string> | null>;

interface SearchResult {
  candidates: FactCheckCandidate[];
  failed: boolean;
}

function toSite(publisherSite: string | undefined, url: string): string {
  const site = (publisherSite ?? "").trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  if (site) return site;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function toReviewDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = /^\d{4}-\d{2}-\d{2}/.exec(value);
  return match ? match[0] : undefined;
}

/** Zet één Google-review om naar het contract; `null` als velden ontbreken. */
function mapReview(review: GoogleClaimReview): FactCheck | null {
  const url = (review.url ?? "").trim();
  const rating = (review.textualRating ?? "").trim();
  const title = (review.title ?? "").trim();
  const publisher = (review.publisher?.name ?? "").trim();

  if (!url || !rating || !publisher) return null;
  if (!/^https?:\/\//i.test(url)) return null;

  const publisherSite = toSite(review.publisher?.site, url);
  if (!publisherSite) return null;

  return {
    publisher,
    publisher_site: publisherSite,
    rating_text: rating,
    title: title || publisher,
    url,
    review_date: toReviewDate(review.reviewDate),
    source_type: "factchecker",
  };
}

/** Eén Google-zoekvraag. `null` bij HTTP-fout, timeout of netwerkfout. */
async function searchGoogle(query: string, apiKey: string): Promise<GoogleClaim[] | null> {
  const url = new URL(GOOGLE_FACTCHECK_URL);
  url.searchParams.set("query", query);
  url.searchParams.set("languageCode", "en");
  url.searchParams.set("pageSize", String(FACT_CHECK_PAGE_SIZE));
  url.searchParams.set("key", apiKey);

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FACT_CHECK_TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as GoogleResponse;
    return data.claims ?? [];
  } catch {
    // Timeout, netwerkfout of ongeldige JSON.
    return null;
  }
}

/**
 * Zoekt met de volledige claimzin én met de korte zoekterm (Google matcht op
 * trefwoorden: lange zinnen vinden vaak niets). Resultaten worden samengevoegd
 * per gecheckte bewering en ontdubbeld op URL.
 */
async function searchOneClaim(
  claim: ExtractedClaim,
  claimIndex: number,
  apiKey: string,
): Promise<SearchResult> {
  const queries = [claim.text, claim.searchQuery].filter(
    (query, index, all) =>
      query.trim().length > 0 &&
      all.findIndex((other) => other.toLowerCase() === query.toLowerCase()) === index,
  );

  const responses = await Promise.all(queries.map((query) => searchGoogle(query, apiKey)));
  const failed = responses.every((response) => response === null);

  const candidates: FactCheckCandidate[] = [];
  const seenUrls = new Set<string>();

  for (const googleClaims of responses) {
    for (const googleClaim of googleClaims ?? []) {
      if (candidates.length >= MAX_FACTCHECK_CANDIDATES) break;

      const factchecks: FactCheck[] = [];
      for (const review of googleClaim.claimReview ?? []) {
        const factcheck = mapReview(review);
        if (!factcheck || seenUrls.has(factcheck.url)) continue;
        seenUrls.add(factcheck.url);
        factchecks.push(factcheck);
      }
      if (factchecks.length === 0) continue;

      candidates.push({
        id: `c${claimIndex}-k${candidates.length}`,
        checkedClaim: (googleClaim.text ?? "").replace(/\s+/g, " ").trim(),
        factchecks,
      });
    }
  }

  return { candidates, failed };
}

/**
 * Zoekt per claim parallel factchecks bij Google en houdt alleen de
 * factchecks over die over dezelfde specifieke bewering gaan (zie
 * `relevance.ts`). Een fout of lege respons blokkeert de rest nooit: de claim
 * blijft `no_factcheck_found` en er komt een limitation bij.
 */
export async function factCheckClaims(
  claims: ExtractedClaim[],
  judge: RelevanceJudge = judgeRelevance,
): Promise<{ claims: Claim[]; limitations: string[] }> {
  const empty = (claim: ExtractedClaim): Claim => ({
    text: claim.text,
    status: "no_factcheck_found",
    factchecks: [],
  });

  if (claims.length === 0) {
    return { claims: [], limitations: [] };
  }

  const apiKey = process.env.GOOGLE_FACTCHECK_API_KEY;
  if (!apiKey) {
    return {
      claims: claims.map(empty),
      limitations: [
        "Factcheck-stap overgeslagen: GOOGLE_FACTCHECK_API_KEY ontbreekt op de server.",
      ],
    };
  }

  const searches = await Promise.all(
    claims.map((claim, index) => searchOneClaim(claim, index, apiKey)),
  );

  const limitations: string[] = [];
  const failedCount = searches.filter((search) => search.failed).length;
  if (failedCount > 0) {
    limitations.push(
      `Factcheck-opzoeking mislukte voor ${failedCount} van ${claims.length} claim(s); ` +
        "deze staan op 'geen factcheck gevonden'.",
    );
  }

  const hasCandidates = searches.some((search) => search.candidates.length > 0);
  let relevant: Set<string> | null = new Set();
  if (hasCandidates) {
    relevant = await judge(
      claims.map((claim, index) => ({
        claim: claim.text,
        candidates: searches[index]?.candidates ?? [],
      })),
    );
    if (relevant === null) limitations.push(RELEVANCE_FAILED_LIMITATION);
  }

  const result: Claim[] = claims.map((claim, index) => {
    const kept = (searches[index]?.candidates ?? []).filter(
      (candidate) => relevant === null || relevant.has(candidate.id),
    );
    const factchecks = kept
      .flatMap((candidate) => candidate.factchecks)
      .slice(0, MAX_FACTCHECKS_PER_CLAIM);

    return factchecks.length > 0
      ? { text: claim.text, status: "factcheck_found", factchecks }
      : empty(claim);
  });

  if (result.some((claim) => claim.factchecks.length > 0)) {
    limitations.push(FACTCHECK_POLARITY_LIMITATION);
  }

  return { claims: result, limitations };
}
