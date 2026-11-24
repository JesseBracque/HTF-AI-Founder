import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_CLAIMS, SCALE_NOTE } from "../../shared/constants";
import { normalizeOutput } from "../src/pipeline/normalize";
import type { ModelOutput } from "../src/schema";

function output(overrides: Partial<ModelOutput["bias"]> = {}, claims: string[] = []): ModelOutput {
  return {
    bias: {
      label: "center",
      confidence: 0.8,
      explanation: "De tekst presenteert beide kanten met vergelijkbare aandacht.",
      evidence: [{ quote: "Both parties agreed", reason: "Neutrale formulering." }],
      ...overrides,
    },
    claims,
  };
}

describe("normalizeOutput", () => {
  it("zet altijd de vaste scale_note", () => {
    assert.equal(normalizeOutput(output()).bias.scale_note, SCALE_NOTE);
  });

  it("begrenst confidence tussen 0 en 1", () => {
    assert.equal(normalizeOutput(output({ confidence: 1.7 })).bias.confidence, 1);
    assert.equal(normalizeOutput(output({ confidence: -0.2 })).bias.confidence, 0);
    assert.equal(normalizeOutput(output({ confidence: Number.NaN })).bias.confidence, 0);
  });

  it("ontdubbelt claims, schoont witruimte op en respecteert het maximum", () => {
    const claims = [
      "Claim  one.",
      "claim one.",
      "Claim two.",
      "Claim three.",
      "Claim four.",
      "Claim five.",
      "Claim six.",
    ];
    const result = normalizeOutput(output({}, claims));

    assert.equal(result.claims.length, MAX_CLAIMS);
    assert.equal(result.claims[0]?.text, "Claim one.");
    assert.ok(result.claims.every((c) => c.status === "no_factcheck_found" && c.factchecks.length === 0));
  });

  it("not_political → geen claims", () => {
    const result = normalizeOutput(output({ label: "not_political" }, ["A claim.", "B claim.", "C claim."]));
    assert.deepEqual(result.claims, []);
  });

  it("geen claims bij een politieke tekst → limitation", () => {
    const result = normalizeOutput(output({}, []));
    assert.match(result.limitations.join(" "), /Geen controleerbare claims/);
  });

  it("lage zekerheid met korte uitleg → limitation", () => {
    const result = normalizeOutput(output({ confidence: 0.4, explanation: "Gemengd." }, ["A.", "B.", "C."]));
    assert.match(result.limitations.join(" "), /onzeker/);
  });
});
