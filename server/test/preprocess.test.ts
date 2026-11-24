import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  MAX_CHARS,
  MAX_WORDS,
  TRUNCATION_LIMITATION,
} from "../../shared/constants";
import { PipelineError } from "../src/errors";
import { countWords, preprocess, stripPublisherMetadata } from "../src/pipeline/preprocess";

const ARTICLE = readFileSync(
  new URL("../../docs/fixtures/article-en.txt", import.meta.url),
  "utf8",
);

function expectPipelineError(fn: () => unknown, code: string): void {
  assert.throws(fn, (err: unknown) => err instanceof PipelineError && err.code === code);
}

describe("preprocess", () => {
  it("accepteert het Engelse testartikel", () => {
    const result = preprocess(ARTICLE);
    assert.ok(result.words >= 150);
    assert.equal(result.truncated, false);
    assert.deepEqual(result.limitations, []);
  });

  it("weigert te korte tekst (too_short)", () => {
    expectPipelineError(() => preprocess("The Senate passed the bill on Thursday."), "too_short");
  });

  it("weigert tekst boven de harde tekengrens (too_long, 413)", () => {
    const err = (() => {
      try {
        preprocess("a".repeat(MAX_CHARS + 1));
      } catch (e) {
        return e;
      }
    })();
    assert.ok(err instanceof PipelineError);
    assert.equal(err.code, "too_long");
    assert.equal(err.status, 413);
  });

  it("weigert niet-Engelse tekst (not_english)", () => {
    const dutch = (
      "De regering heeft vandaag een nieuw wetsvoorstel ingediend over de financiering van " +
      "het onderwijs. Volgens de minister moeten scholen meer geld krijgen om leraren aan te " +
      "nemen en klassen kleiner te maken. De oppositie noemt het plan te duur en vraagt zich " +
      "af waar het geld vandaan moet komen. "
    ).repeat(5);
    expectPipelineError(() => preprocess(dutch), "not_english");
  });

  it("kapt af op 3.000 woorden en voegt een limitation toe", () => {
    // Korte woorden: >3.000 woorden maar onder de harde tekengrens van 20.000.
    const long = "the vote was close and the bill passed today ".repeat(400);
    assert.ok(countWords(long) > MAX_WORDS && long.length <= MAX_CHARS);

    const result = preprocess(long);

    assert.equal(result.truncated, true);
    assert.equal(result.words, MAX_WORDS);
    assert.deepEqual(result.limitations, [TRUNCATION_LIMITATION]);
  });
});

describe("stripPublisherMetadata", () => {
  it("verwijdert URL's, bylines en publicatieregels", () => {
    const raw = [
      "By Jane Doe",
      "Published March 3, 2024",
      "The bill passed, see https://example.com/news/bill for details.",
      "Updated 10:32 AM",
    ].join("\n");

    const out = stripPublisherMetadata(raw);

    assert.doesNotMatch(out, /Jane Doe/);
    assert.doesNotMatch(out, /Published|Updated/);
    assert.doesNotMatch(out, /example\.com/);
    assert.match(out, /The bill passed/);
  });

  it("laat gewone zinnen die met 'by' beginnen staan", () => {
    const sentence = "By Thursday, the Senate had passed the bill with a narrow majority.";
    assert.equal(stripPublisherMetadata(sentence), sentence);
  });
});
