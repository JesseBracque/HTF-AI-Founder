import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  FACTCHECK_POLARITY_LIMITATION,
  MAX_FACTCHECKS_PER_CLAIM,
  MAX_FACTCHECK_CANDIDATES,
  RELEVANCE_FAILED_LIMITATION,
} from "../../shared/constants";
import {
  factCheckClaims,
  type RelevanceItem,
  type RelevanceJudge,
} from "../src/pipeline/factcheck";
import type { ExtractedClaim } from "../src/pipeline/normalize";

const realFetch = globalThis.fetch;
const realKey = process.env.GOOGLE_FACTCHECK_API_KEY;

function claim(text: string, searchQuery = "short query"): ExtractedClaim {
  return { text, searchQuery };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Google-claim met één geldige review. */
function googleClaim(text: string, url: string, rating = "False", publisher = "PolitiFact") {
  return {
    text,
    claimReview: [{ publisher: { name: publisher }, url, title: `Check: ${text}`, textualRating: rating }],
  };
}

/** Vervangt fetch; onthoudt alle aangeroepen URL's. */
function mockFetch(handler: (url: URL) => Response | Promise<Response>): URL[] {
  const calls: URL[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input);
    calls.push(url);
    return handler(url);
  }) as typeof fetch;
  return calls;
}

/** Nep-relevantiecontrole: keurt alles goed en onthoudt wat hij kreeg. */
function acceptAll(): { judge: RelevanceJudge; seen: RelevanceItem[][] } {
  const seen: RelevanceItem[][] = [];
  const judge: RelevanceJudge = async (items) => {
    seen.push(items);
    return new Set(items.flatMap((item) => item.candidates.map((c) => c.id)));
  };
  return { judge, seen };
}

describe("factCheckClaims", () => {
  beforeEach(() => {
    process.env.GOOGLE_FACTCHECK_API_KEY = "test-key";
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    if (realKey === undefined) delete process.env.GOOGLE_FACTCHECK_API_KEY;
    else process.env.GOOGLE_FACTCHECK_API_KEY = realKey;
  });

  it("slaat de stap over met een limitation als de key ontbreekt", async () => {
    delete process.env.GOOGLE_FACTCHECK_API_KEY;
    const calls = mockFetch(() => jsonResponse({}));

    const result = await factCheckClaims([claim("A claim.")], acceptAll().judge);

    assert.equal(calls.length, 0);
    assert.deepEqual(result.claims, [
      { text: "A claim.", status: "no_factcheck_found", factchecks: [] },
    ]);
    assert.match(result.limitations.join(" "), /GOOGLE_FACTCHECK_API_KEY ontbreekt/);
  });

  it("doet niets bij een lege claimlijst", async () => {
    const calls = mockFetch(() => jsonResponse({}));
    const result = await factCheckClaims([], acceptAll().judge);
    assert.equal(calls.length, 0);
    assert.deepEqual(result, { claims: [], limitations: [] });
  });

  it("zoekt per claim met de volledige zin én de korte zoekterm", async () => {
    const calls = mockFetch(() => jsonResponse({}));

    await factCheckClaims(
      [
        claim("The Senate passed the bill 51 to 49.", "Senate bill vote"),
        claim("Unemployment fell to 3.5%.", "unemployment 3.5%"),
      ],
      acceptAll().judge,
    );

    assert.deepEqual(
      calls.map((url) => url.searchParams.get("query")).sort(),
      [
        "Senate bill vote",
        "The Senate passed the bill 51 to 49.",
        "Unemployment fell to 3.5%.",
        "unemployment 3.5%",
      ].sort(),
    );
    for (const url of calls) {
      assert.equal(url.hostname, "factchecktools.googleapis.com");
      assert.equal(url.searchParams.get("languageCode"), "en");
      assert.equal(url.searchParams.get("pageSize"), "10");
      assert.equal(url.searchParams.get("key"), "test-key");
    }
  });

  it("zoekt maar één keer als zoekterm en claim gelijk zijn", async () => {
    const calls = mockFetch(() => jsonResponse({}));
    await factCheckClaims([claim("Same text", "same TEXT")], acceptAll().judge);
    assert.equal(calls.length, 1);
  });

  it("neemt de rating letterlijk over, ontdubbelt op URL en vult het contract", async () => {
    mockFetch((url) =>
      jsonResponse({
        claims:
          url.searchParams.get("query") === "short query"
            ? [
                {
                  text: "Checked claim A",
                  claimReview: [
                    {
                      publisher: { name: "PolitiFact", site: "politifact.com" },
                      url: "https://www.politifact.com/a",
                      title: "Fact-check A",
                      reviewDate: "2024-03-01T00:00:00Z",
                      textualRating: "Mostly False",
                    },
                    // Geen rating → wordt overgeslagen.
                    { publisher: { name: "X" }, url: "https://x.example/b" },
                  ],
                },
                {
                  text: "Checked claim B",
                  claimReview: [
                    {
                      // Geen publisher.site → domein uit de URL.
                      publisher: { name: "Full Fact" },
                      url: "https://www.fullfact.org/c",
                      textualRating: "Vaccines do not cause autism.",
                    },
                  ],
                },
              ]
            : // De volledige zin vindt dezelfde factcheck nog eens → ontdubbeld.
              [googleClaim("Checked claim A", "https://www.politifact.com/a", "Mostly False")],
      }),
    );

    const result = await factCheckClaims([claim("A claim.")], acceptAll().judge);
    const [c] = result.claims;

    assert.equal(c?.status, "factcheck_found");
    assert.deepEqual(
      c?.factchecks.map((f) => f.url).sort(),
      ["https://www.fullfact.org/c", "https://www.politifact.com/a"],
    );
    const politifact = c?.factchecks.find((f) => f.publisher === "PolitiFact");
    assert.equal(politifact?.rating_text, "Mostly False");
    const fullfact = c?.factchecks.find((f) => f.publisher === "Full Fact");
    assert.deepEqual(fullfact, {
      publisher: "Full Fact",
      publisher_site: "fullfact.org",
      rating_text: "Vaccines do not cause autism.",
      title: "Full Fact",
      url: "https://www.fullfact.org/c",
      review_date: undefined,
      source_type: "factchecker",
    });
    assert.deepEqual(result.limitations, [FACTCHECK_POLARITY_LIMITATION]);
  });

  it("houdt alleen kandidaten over die de relevantiecontrole goedkeurt", async () => {
    mockFetch(() =>
      jsonResponse({
        claims: [
          googleClaim("Senate passed the border bill 51-49", "https://fc.example/match"),
          googleClaim("House passed a different border bill", "https://fc.example/other"),
        ],
      }),
    );
    const seen: RelevanceItem[][] = [];
    const judge: RelevanceJudge = async (items) => {
      seen.push(items);
      const match = items[0]?.candidates.find((c) => c.checkedClaim.startsWith("Senate"));
      return new Set(match ? [match.id] : []);
    };

    const result = await factCheckClaims([claim("The Senate passed the bill 51 to 49.")], judge);

    assert.equal(seen.length, 1);
    assert.equal(seen[0]?.[0]?.claim, "The Senate passed the bill 51 to 49.");
    assert.equal(seen[0]?.[0]?.candidates.length, 2);
    assert.deepEqual(result.claims[0]?.factchecks.map((f) => f.url), ["https://fc.example/match"]);
  });

  it("alles afgekeurd → no_factcheck_found zonder polariteitsmelding", async () => {
    mockFetch(() => jsonResponse({ claims: [googleClaim("Other topic", "https://fc.example/x")] }));
    const result = await factCheckClaims([claim("A claim.")], async () => new Set());
    assert.equal(result.claims[0]?.status, "no_factcheck_found");
    assert.deepEqual(result.limitations, []);
  });

  it("mislukte relevantiecontrole → ongefilterd tonen met limitation", async () => {
    mockFetch(() => jsonResponse({ claims: [googleClaim("Checked", "https://fc.example/y")] }));
    const result = await factCheckClaims([claim("A claim.")], async () => null);
    assert.equal(result.claims[0]?.status, "factcheck_found");
    assert.ok(result.limitations.includes(RELEVANCE_FAILED_LIMITATION));
  });

  it("roept de relevantiecontrole niet aan zonder kandidaten", async () => {
    mockFetch(() => jsonResponse({}));
    let called = false;
    const result = await factCheckClaims([claim("A claim.")], async () => {
      called = true;
      return new Set();
    });
    assert.equal(called, false);
    assert.equal(result.claims[0]?.status, "no_factcheck_found");
    assert.deepEqual(result.limitations, []);
  });

  it("begrenst kandidaten en factchecks per claim", async () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      googleClaim(`Checked ${i}`, `https://fc.example/${i}`),
    );
    mockFetch(() => jsonResponse({ claims: many }));
    const { judge, seen } = acceptAll();

    const result = await factCheckClaims([claim("A claim.")], judge);

    assert.equal(seen[0]?.[0]?.candidates.length, MAX_FACTCHECK_CANDIDATES);
    assert.equal(result.claims[0]?.factchecks.length, MAX_FACTCHECKS_PER_CLAIM);
  });

  it("een mislukte claim blokkeert de andere claims niet", async () => {
    mockFetch((url) => {
      const query = url.searchParams.get("query") ?? "";
      if (query.startsWith("bad")) return jsonResponse({ error: {} }, 403);
      return jsonResponse({ claims: [googleClaim("Checked", "https://factcheck.afp.com/d")] });
    });

    const result = await factCheckClaims(
      [claim("bad claim", "bad query"), claim("good claim", "good query")],
      acceptAll().judge,
    );

    assert.equal(result.claims[0]?.status, "no_factcheck_found");
    assert.equal(result.claims[1]?.status, "factcheck_found");
    assert.match(result.limitations.join(" "), /mislukte voor 1 van 2/);
  });

  it("telt een claim niet als mislukt als één van de twee zoekvragen slaagt", async () => {
    mockFetch((url) =>
      url.searchParams.get("query") === "short query"
        ? jsonResponse({ claims: [googleClaim("Checked", "https://fc.example/z")] })
        : jsonResponse({ error: {} }, 500),
    );
    const result = await factCheckClaims([claim("A claim.")], acceptAll().judge);
    assert.equal(result.claims[0]?.status, "factcheck_found");
    assert.doesNotMatch(result.limitations.join(" "), /mislukte/);
  });

  it("netwerkfout telt als mislukte opzoeking", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("network down");
    }) as typeof fetch;

    const result = await factCheckClaims([claim("A claim.")], acceptAll().judge);

    assert.equal(result.claims[0]?.status, "no_factcheck_found");
    assert.match(result.limitations.join(" "), /mislukte voor 1 van 1/);
  });
});
