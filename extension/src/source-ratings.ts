/**
 * Statische bronrating van de uitgever (J6, stretch).
 *
 * Dit is een APART signaal: het wordt alleen in de popup getoond en nooit naar
 * de server gestuurd. De analyse zelf kijkt niet naar de uitgever.
 *
 * Bron: AllSides Media Bias Ratings (https://www.allsides.com/media-bias/media-bias-ratings),
 * licentie CC BY-NC 4.0 — alleen niet-commercieel gebruik, met bronvermelding.
 * De ratings zijn een momentopname en kunnen wijzigen; controleer de bron-URL.
 */
export interface SourceRating {
  publisher: string;
  /** Rating zoals AllSides die noemt. */
  rating: string;
  sourceUrl: string;
  /** Momentopname; AllSides past ratings periodiek aan. */
  asOf: string;
  license: string;
}

const ALLSIDES_URL = "https://www.allsides.com/media-bias/media-bias-ratings";
const LICENSE = "CC BY-NC 4.0";

const RATINGS: Record<string, SourceRating> = {
  "apnews.com": {
    publisher: "Associated Press",
    rating: "Center",
    sourceUrl: ALLSIDES_URL,
    asOf: "2024",
    license: LICENSE,
  },
  "reuters.com": {
    publisher: "Reuters",
    rating: "Center",
    sourceUrl: ALLSIDES_URL,
    asOf: "2024",
    license: LICENSE,
  },
  "wsj.com": {
    publisher: "The Wall Street Journal",
    rating: "Center",
    sourceUrl: ALLSIDES_URL,
    asOf: "2024",
    license: LICENSE,
  },
  "npr.org": {
    publisher: "NPR",
    rating: "Lean Left",
    sourceUrl: ALLSIDES_URL,
    asOf: "2024",
    license: LICENSE,
  },
  "cnn.com": {
    publisher: "CNN",
    rating: "Left",
    sourceUrl: ALLSIDES_URL,
    asOf: "2024",
    license: LICENSE,
  },
  "nytimes.com": {
    publisher: "The New York Times",
    rating: "Left",
    sourceUrl: ALLSIDES_URL,
    asOf: "2024",
    license: LICENSE,
  },
  "washingtonpost.com": {
    publisher: "The Washington Post",
    rating: "Left",
    sourceUrl: ALLSIDES_URL,
    asOf: "2024",
    license: LICENSE,
  },
  "msnbc.com": {
    publisher: "MSNBC",
    rating: "Left",
    sourceUrl: ALLSIDES_URL,
    asOf: "2024",
    license: LICENSE,
  },
  "huffpost.com": {
    publisher: "HuffPost",
    rating: "Left",
    sourceUrl: ALLSIDES_URL,
    asOf: "2024",
    license: LICENSE,
  },
  "foxnews.com": {
    publisher: "Fox News",
    rating: "Right",
    sourceUrl: ALLSIDES_URL,
    asOf: "2024",
    license: LICENSE,
  },
  "breitbart.com": {
    publisher: "Breitbart News",
    rating: "Right",
    sourceUrl: ALLSIDES_URL,
    asOf: "2024",
    license: LICENSE,
  },
  "newsmax.com": {
    publisher: "Newsmax",
    rating: "Right",
    sourceUrl: ALLSIDES_URL,
    asOf: "2024",
    license: LICENSE,
  },
};

function hostnameMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

/** Zoekt de rating voor een hostname (inclusief subdomeinen), of undefined. */
export function getSourceRating(hostname: string | undefined): SourceRating | undefined {
  if (!hostname) {
    return undefined;
  }
  const host = hostname.toLowerCase();
  for (const [domain, rating] of Object.entries(RATINGS)) {
    if (hostnameMatches(host, domain)) {
      return rating;
    }
  }
  return undefined;
}
