import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SYSTEM_PROMPT, buildUserPrompt } from "../src/prompts/codebook";

describe("codebook prompt", () => {
  // Regressie: zonder deze regel schreef het model claims in het Nederlands,
  // waardoor Google Fact Check (languageCode=en) nooit iets vond.
  it("eist dat claims in het Engels zijn", () => {
    assert.match(SYSTEM_PROMPT, /claim "text" in ENGLISH/);
  });

  it("vraagt Nederlandse uitleg en letterlijke Engelse citaten", () => {
    assert.match(SYSTEM_PROMPT, /"explanation" and every\s+"reason" in Dutch/);
    assert.match(SYSTEM_PROMPT, /Quotes stay verbatim English/);
  });

  it("noemt de Amerikaanse schaal en laat het model niet over waarheid oordelen", () => {
    assert.match(SYSTEM_PROMPT, /US spectrum/);
    assert.match(SYSTEM_PROMPT, /Never say whether a claim is true or false/);
  });

  it("eist atomaire, korte claims met de volledige naam van het onderwerp", () => {
    assert.match(SYSTEM_PROMPT, /One fact per claim \(atomic\)/);
    assert.match(SYSTEM_PROMPT, /at most 25 words/);
    assert.match(SYSTEM_PROMPT, /Name the main subject in full/);
  });

  it("zet de artikeltekst tussen duidelijke grenzen in de user prompt", () => {
    const prompt = buildUserPrompt("Hello article.");
    assert.match(prompt, /<<<ARTICLE\nHello article\.\nARTICLE>>>/);
  });
});
