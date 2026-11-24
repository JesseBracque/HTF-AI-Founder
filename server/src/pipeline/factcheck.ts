import {
  FACT_CHECK_PAGE_SIZE,
  FACT_CHECK_TIMEOUT_MS,
  GOOGLE_FACTCHECK_URL,
} from "../../../shared/constants";
import type { Claim, FactCheck } from "../schema";

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

interface ClaimResult {
  claim: Claim;
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

function mapFactChecks(response: GoogleResponse): FactCheck[] {
  const reviews = (response.claims ?? []).flatMap((claim) => claim.claimReview ?? []);
  const seen = new Set<string>();
  const factchecks: FactCheck[] = [];

  for (const review of reviews) {
    const url = (review.url ?? "").trim();
    const rating = (review.textualRating ?? "").trim();
    const title = (review.title ?? "").trim();
    const publisher = (review.publisher?.name ?? "").trim();

    if (!url || !rating || !publisher || seen.has(url)) continue;
    if (!/^https?:\/\//i.test(url)) continue;

    const publisherSite = toSite(review.publisher?.site, url);
    if (!publisherSite) continue;

    seen.add(url);
    factchecks.push({
      publisher,
      publisher_site: publisherSite,
      rating_text: rating,
      title: title || publisher,
      url,
      review_date: toReviewDate(review.reviewDate),
      source_type: "factchecker",
    });
  }

  return factchecks;
}

async function checkOneClaim(claim: Claim, apiKey: string): Promise<ClaimResult> {
  const url = new URL(GOOGLE_FACTCHECK_URL);
  url.searchParams.set("query", claim.text);
  url.searchParams.set("languageCode", "en");
  url.searchParams.set("pageSize", String(FACT_CHECK_PAGE_SIZE));
  url.searchParams.set("key", apiKey);

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FACT_CHECK_TIMEOUT_MS),
      headers: { accept: "application/json" },
    });

    if (!response.ok) {
      return { claim, failed: true };
    }

    const data = (await response.json()) as GoogleResponse;
    const factchecks = mapFactChecks(data);

    return {
      claim: {
        ...claim,
        status: factchecks.length > 0 ? "factcheck_found" : "no_factcheck_found",
        factchecks,
      },
      failed: false,
    };
  } catch {
    // Timeout, netwerkfout of ongeldige JSON: claim blijft zonder factcheck.
    return { claim, failed: true };
  }
}

/**
 * Zoekt parallel per claim factchecks. Een fout of lege respons blokkeert de
 * rest nooit: de claim blijft `no_factcheck_found` en er komt een limitation bij.
 */
export async function factCheckClaims(
  claims: Claim[],
): Promise<{ claims: Claim[]; limitations: string[] }> {
  if (claims.length === 0) {
    return { claims, limitations: [] };
  }

  const apiKey = process.env.GOOGLE_FACTCHECK_API_KEY;
  if (!apiKey) {
    return {
      claims,
      limitations: [
        "Factcheck-stap overgeslagen: GOOGLE_FACTCHECK_API_KEY ontbreekt op de server.",
      ],
    };
  }

  const results = await Promise.all(claims.map((claim) => checkOneClaim(claim, apiKey)));

  const failedCount = results.filter((result) => result.failed).length;
  const limitations: string[] = [];
  if (failedCount > 0) {
    limitations.push(
      `Factcheck-opzoeking mislukte voor ${failedCount} van ${claims.length} claim(s); ` +
        "deze staan op 'geen factcheck gevonden'.",
    );
  }

  return { claims: results.map((result) => result.claim), limitations };
}
