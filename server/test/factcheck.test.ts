import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { FACTCHECK_POLARITY_LIMITATION } from "../../shared/constants";
import { factCheckClaims } from "../src/pipeline/factcheck";
import type { Claim } from "../src/schema";

const realFetch = globalThis.fetch;
const realKey = process.env.GOOGLE_FACTCHECK_API_KEY;

function claim(text: string): Claim {
  return { text, status: "no_factcheck_found", factchecks: [] };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
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

    const result = await factCheckClaims([claim("A claim.")]);

    assert.equal(calls.length, 0);
    assert.equal(result.claims[0]?.status, "no_factcheck_found");
    assert.match(result.limitations.join(" "), /GOOGLE_FACTCHECK_API_KEY ontbreekt/);
  });

  it("doet niets bij een lege claimlijst", async () => {
    const calls = mockFetch(() => jsonResponse({}));
    const result = await factCheckClaims([]);
    assert.equal(calls.length, 0);
    assert.deepEqual(result, { claims: [], limitations: [] });
  });

  it("zoekt per claim met de claimtekst, languageCode=en en de key", async () => {
    const calls = mockFetch(() => jsonResponse({}));
    const texts = ["The Senate passed the bill 51 to 49.", "Unemployment fell to 3.5%."];

    await factCheckClaims(texts.map(claim));

    assert.equal(calls.length, 2);
    for (const [i, url] of calls.entries()) {
      assert.equal(url.hostname, "factchecktools.googleapis.com");
      assert.equal(url.searchParams.get("query"), texts[i]);
      assert.equal(url.searchParams.get("languageCode"), "en");
      assert.equal(url.searchParams.get("key"), "test-key");
    }
  });

  it("neemt de rating letterlijk over en ontdubbelt op URL", async () => {
    mockFetch(() =>
      jsonResponse({
        claims: [
          {
            text: "x",
            claimReview: [
              {
                publisher: { name: "PolitiFact", site: "politifact.com" },
                url: "https://www.politifact.com/a",
                title: "Fact-check A",
                reviewDate: "2024-03-01T00:00:00Z",
                textualRating: "Mostly False",
              },
              // Dubbele URL → wordt overgeslagen.
              {
                publisher: { name: "PolitiFact", site: "politifact.com" },
                url: "https://www.politifact.com/a",
                textualRating: "Mostly False",
              },
              // Geen rating → wordt overgeslagen.
              { publisher: { name: "X" }, url: "https://x.example/b" },
            ],
          },
          {
            text: "y",
            claimReview: [
              {
                // Geen publisher.site → domein uit de URL.
                publisher: { name: "Full Fact" },
                url: "https://www.fullfact.org/c",
                textualRating: "Vaccines do not cause autism.",
              },
            ],
          },
        ],
      }),
    );

    const result = await factCheckClaims([claim("A claim.")]);
    const [c] = result.claims;

    assert.equal(c?.status, "factcheck_found");
    assert.deepEqual(c?.factchecks, [
      {
        publisher: "PolitiFact",
        publisher_site: "politifact.com",
        rating_text: "Mostly False",
        title: "Fact-check A",
        url: "https://www.politifact.com/a",
        review_date: "2024-03-01",
        source_type: "factchecker",
      },
      {
        publisher: "Full Fact",
        publisher_site: "fullfact.org",
        rating_text: "Vaccines do not cause autism.",
        title: "Full Fact",
        url: "https://www.fullfact.org/c",
        review_date: undefined,
        source_type: "factchecker",
      },
    ]);
    assert.deepEqual(result.limitations, [FACTCHECK_POLARITY_LIMITATION]);
  });

  it("lege Google-respons → no_factcheck_found zonder limitation", async () => {
    mockFetch(() => jsonResponse({}));
    const result = await factCheckClaims([claim("A claim.")]);
    assert.equal(result.claims[0]?.status, "no_factcheck_found");
    assert.deepEqual(result.limitations, []);
  });

  it("een mislukte call blokkeert de andere claims niet", async () => {
    mockFetch((url) => {
      if (url.searchParams.get("query") === "bad") return jsonResponse({ error: {} }, 403);
      return jsonResponse({
        claims: [
          {
            claimReview: [
              {
                publisher: { name: "AFP Fact Check", site: "factcheck.afp.com" },
                url: "https://factcheck.afp.com/d",
                textualRating: "False",
              },
            ],
          },
        ],
      });
    });

    const result = await factCheckClaims([claim("bad"), claim("good")]);

    assert.equal(result.claims[0]?.status, "no_factcheck_found");
    assert.equal(result.claims[1]?.status, "factcheck_found");
    assert.match(result.limitations.join(" "), /mislukte voor 1 van 2/);
  });

  it("netwerkfout telt als mislukte opzoeking", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("network down");
    }) as typeof fetch;

    const result = await factCheckClaims([claim("A claim.")]);

    assert.equal(result.claims[0]?.status, "no_factcheck_found");
    assert.match(result.limitations.join(" "), /mislukte voor 1 van 1/);
  });
});
