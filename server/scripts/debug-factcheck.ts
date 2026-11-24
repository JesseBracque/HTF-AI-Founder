/**
 * Debug: toont per claim de zoekterm, de Google-kandidaten en het oordeel van
 * de relevantiecontrole.
 *
 * Gebruik (in server/):
 *   npm run debug:factcheck                  # vaste voorbeeldclaims
 *   npm run debug:factcheck -- artikel.txt   # volledige pipeline op eigen tekst
 *
 * Let op: staat ANTHROPIC_BASE_URL al in je shell, dan wint die van .env
 * (dotenv overschrijft niets) en faalt de modelaanroep met een auth-fout.
 * Logt geen keys. Paginatekst wordt alleen lokaal ingelezen, nooit gelogd.
 */
import { readFileSync } from "node:fs";
import "../src/env";
import { analyzeText } from "../src/pipeline/analyze";
import { factCheckClaims, type RelevanceItem } from "../src/pipeline/factcheck";
import { normalizeOutput, type ExtractedClaim } from "../src/pipeline/normalize";
import { preprocess } from "../src/pipeline/preprocess";
import { judgeRelevance } from "../src/pipeline/relevance";

const SAMPLE_CLAIMS: ExtractedClaim[] = [
  {
    text: "Election officials in several states have rejected allegations that the 2020 presidential election was marred by widespread fraud.",
    searchQuery: "2020 presidential election widespread fraud",
  },
  {
    text: "The Senate approved a border security package 51 to 49 on Thursday.",
    searchQuery: "Senate border security package",
  },
  {
    text: "The Inflation Reduction Act raised taxes on middle-class families.",
    searchQuery: "Inflation Reduction Act middle-class taxes",
  },
];

async function claimsFromFile(file: string): Promise<ExtractedClaim[]> {
  const pre = preprocess(readFileSync(file, "utf8"));
  const normalized = normalizeOutput(await analyzeText(pre.text));
  console.log(`bias: ${normalized.bias.label} (${normalized.bias.confidence})`);
  return normalized.claims;
}

const file = process.argv[2];
const claims = file ? await claimsFromFile(file) : SAMPLE_CLAIMS;

for (const claim of claims) {
  console.log(`\nclaim: ${claim.text}\n  query: ${claim.searchQuery}`);
}

let judged = false;
const result = await factCheckClaims(claims, async (items: RelevanceItem[]) => {
  judged = true;
  const verdict = await judgeRelevance(items);
  for (const item of items) {
    console.log(`\nCLAIM: ${item.claim}`);
    if (item.candidates.length === 0) console.log("  (Google: geen kandidaten)");
    for (const c of item.candidates) {
      const keep = verdict === null ? "?" : verdict.has(c.id) ? "KEEP" : "drop";
      const fc = c.factchecks[0];
      console.log(`  [${keep}] ${c.id} ${c.checkedClaim.slice(0, 100)}`);
      console.log(`         ${fc?.publisher} ${fc?.review_date ?? ""} — ${fc?.title.slice(0, 80)}`);
    }
  }
  return verdict;
});

if (!judged) console.log("\n(Google gaf voor geen enkele claim kandidaten; filter niet aangeroepen)");
console.log("\nlimitations:", result.limitations);
for (const c of result.claims) console.log(`- [${c.status}] ${c.factchecks.length} factcheck(s)`);
