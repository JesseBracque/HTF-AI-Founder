import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RelevanceItem } from "../src/pipeline/factcheck";
import { RELEVANCE_SYSTEM_PROMPT, buildRelevancePrompt } from "../src/prompts/relevance";

const items: RelevanceItem[] = [
  {
    claim: "The Senate passed the border bill 51 to 49.",
    candidates: [
      {
        id: "c0-k0",
        checkedClaim: "Senate approved border bill by two votes",
        factchecks: [
          {
            publisher: "PolitiFact",
            publisher_site: "politifact.com",
            rating_text: "Pants on Fire",
            title: "Did the Senate pass the border bill?",
            url: "https://www.politifact.com/x",
            source_type: "factchecker",
          },
        ],
      },
    ],
  },
  // Claim zonder kandidaten hoort niet in de prompt.
  { claim: "Unrelated claim without results.", candidates: [] },
];

describe("relevance prompt", () => {
  it("bevat claim, gecheckte bewering, titel, uitgever en id", () => {
    const prompt = buildRelevancePrompt(items);
    assert.match(prompt, /CLAIM: "The Senate passed the border bill 51 to 49\."/);
    assert.match(prompt, /id: c0-k0/);
    assert.match(prompt, /checked claim: "Senate approved border bill by two votes"/);
    assert.match(prompt, /fact-check title: "Did the Senate pass the border bill\?"/);
    assert.match(prompt, /publisher: "PolitiFact"/);
  });

  it("geeft de rating van de factchecker niet aan het model (geen waarheidsoordeel)", () => {
    const prompt = buildRelevancePrompt(items);
    assert.doesNotMatch(prompt, /Pants on Fire/);
    assert.match(RELEVANCE_SYSTEM_PROMPT, /never judge whether anything is true or false/);
  });

  it("laat claims zonder kandidaten weg", () => {
    assert.doesNotMatch(buildRelevancePrompt(items), /Unrelated claim/);
  });

  it("telt een factcheck van de tegenbewering mee, een ander onderwerp niet", () => {
    assert.match(RELEVANCE_SYSTEM_PROMPT, /opposite or negated statement also counts/);
    assert.match(RELEVANCE_SYSTEM_PROMPT, /different specific assertion does NOT count/);
  });

  // Regressie: "same event OR same actors" liet een factcheck over een andere
  // bewering bij dezelfde gebeurtenis door (inval ↔ "fled to Morocco").
  it("eist dezelfde kernbewering; zelfde persoon of gebeurtenis is niet genoeg", () => {
    assert.match(RELEVANCE_SYSTEM_PROMPT, /SAME CORE ASSERTION/);
    assert.match(RELEVANCE_SYSTEM_PROMPT, /Sharing the same person,\s+event or topic is NOT enough/);
    assert.doesNotMatch(RELEVANCE_SYSTEM_PROMPT, /the same event, the same actors/);
  });

  it("zet externe tekst tussen datamarkers", () => {
    assert.match(buildRelevancePrompt(items), /<<<DATA\n[\s\S]*\nDATA>>>$/);
  });
});
