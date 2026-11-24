# CLAUDE.md — Bias & Factcheck Extensie (HTF-AI-Founder)

Instructies voor AI-bouwmodellen (Claude Code, OpenCode) die in deze repo werken.
Lees dit volledig vóór je code schrijft. Bouwvolgorde en status: zie [ROADMAP.md](ROADMAP.md).

---

## 1. Wat we bouwen

Een browserextensie (Chrome, Manifest V3) die **op klik van de gebruiker** de hoofdtekst van een
Engelstalige webpagina uitleest en teruggeeft:

1. **Politieke inschatting** van de tekst: `left | center | right | not_political | uncertain`,
   met zekerheid, citaten uit de tekst als onderbouwing en een korte uitleg.
2. **Claims**: de 3–8 belangrijkste controleerbare beweringen, elk met de factchecks die we
   ervoor vonden (of expliciet: "geen factcheck gevonden").
3. **Bronnen**: klikbare links naar factcheckers en nieuwsmedia, zodat de gebruiker zelf kan nalezen.

Het is een **hulpmiddel, geen oordeel**. Het product moet "onzeker" en "geen factcheck gevonden"
kunnen zeggen, en doet dat liever dan te stellig te zijn.

## 2. Harde regels (niet van afwijken zonder overleg)

- **Amerikaanse links/rechts-schaal.** Elke bias-uitkomst vermeldt dit, in de JSON (`bias.scale_note`)
  én zichtbaar in de UI ("Links/rechts volgens de Amerikaanse politieke schaal").
- **Alleen Engelstalige pagina's in v1.** Andere taal → melding "Alleen Engelse pagina's worden
  ondersteund", geen analyse.
- **Inhoud, niet uitgever.** Vóór de tekst naar het model gaat, verwijderen we naam van de uitgever,
  URL/domein en auteursregel. Het model beoordeelt framing en woordkeuze, niet het onderwerp en niet
  wie het publiceert. Geldt in de extensie én in de evaluatie.
- **Het model beslist niet of iets "waar" is.** Een claim krijgt alleen een status op basis van een
  gevonden factcheck. We tonen de rating **in de woorden van de factchecker** (geen normalisatie).
  "Geen factcheck gevonden" ≠ "klopt" — en dat staat er letterlijk bij.
- **Geen eindoordeel "waar/onwaar" over de hele pagina.**
- **Verplichte disclaimer in elk resultaat:**
  "Dit is een hulpmiddel en geen oordeel. Lees de bronnen zelf na."
- **Geen API-keys in de extensie.** Keys staan alleen op de proxy-server (env vars). Nooit committen.
  `.env` staat in `.gitignore`; gebruik `.env.example` met lege waarden.
- **Alleen na klik.** Geen automatische scan van pagina's. Gevoelige domeinen (mail, bank, enz.) staan
  op een blocklist en worden nooit geanalyseerd.
- **Geen opslag van paginatekst** op de server (niet loggen, niet bewaren).
- **Privacymelding** in de popup: de tekst van de pagina wordt naar externe AI- en factcheckdiensten gestuurd.

## 3. Lengtelimieten (vaste technische keuze)

| Grens | Waarde | Gedrag |
|---|---|---|
| Minimum | 150 woorden | "Te kort om te analyseren", geen modelaanroep |
| Maximum | 3.000 woorden (~4.000 tokens) | Afkappen aan het einde, `limitations` krijgt "Analyse gebaseerd op de eerste 3.000 woorden" |
| Server hard limit | 20.000 tekens | Request weigeren (413) |

De evaluatie gebruikt **dezelfde** grenzen en dezelfde voorbewerking als de extensie.

## 4. Architectuur

```
[Extensie]                          [Proxy-server]                      [Externe diensten]
content script ──tekst──► popup ──► POST /analyze ──► 1 LLM-call ──────► Claude API (of andere provider)
(Readability.js)                     (keys, rate limit,  (claims + bias,
                                      validatie)          JSON-schema)
                                                     └─► per claim, parallel ► Google Fact Check Tools API
                                     ◄── gevalideerde JSON (zie §5) ──
```

Pipeline op de server:
1. Valideren (lengte, taal = `en`), uitgever/URL/byline strippen, afkappen op 3.000 woorden.
2. **Eén** modelaanroep die claims én bias-analyse samen teruggeeft als gestructureerde JSON
   (structured outputs, zie §7). Codebook-prompt staat in `server/src/prompts/`.
3. Per claim parallel: Google Fact Check `claims:search` (`languageCode=en`).
4. Samenvoegen, valideren met zod, terugsturen. Doel: resultaat binnen ~10 seconden.

### Mappenstructuur (doel)

```
extension/            Chrome MV3-extensie (TypeScript, Vite)
  manifest.json
  src/content.ts      tekstextractie met @mozilla/readability
  src/popup/          UI: resultaat, disclaimer, privacymelding
  src/background.ts   service worker, praat met proxy
server/               Proxy (TypeScript; Cloudflare Worker of Node — zie ROADMAP open punten)
  src/index.ts        POST /analyze, CORS alleen voor extensie-origin, rate limit
  src/pipeline/       preprocess.ts, analyze.ts (LLM), factcheck.ts (Google)
  src/schema.ts       zod-schema = enige bron van waarheid voor de output
  src/prompts/        codebook + claim-extractie prompt
eval/                 Evaluatiescripts (TypeScript), hergebruikt server/src/pipeline
  data/               datasets — NIET committen (gitignored), alleen download-instructies
  results/            meetresultaten (csv/json) — wel committen
docs/                 Overige projectdocumenten
.env.example
```

## 5. Outputschema (contract tussen server en extensie)

Definieer dit in `server/src/schema.ts` (zod) en importeer het type in de extensie.

```ts
{
  bias: {
    label: "left" | "center" | "right" | "not_political" | "uncertain",
    confidence: number,            // 0..1; onder 0.6 is `explanation` verplicht uitgebreider
    explanation: string,           // kort, neutraal geformuleerd
    evidence: { quote: string, reason: string }[],   // letterlijke citaten uit de tekst
    scale_note: "Left/right according to the US political spectrum."  // vaste tekst
  },
  claims: {
    text: string,
    status: "factcheck_found" | "no_factcheck_found",
    factchecks: {
      publisher: string,           // bv. "PolitiFact"
      publisher_site: string,      // domein
      rating_text: string,         // letterlijk textualRating van de factchecker
      title: string,
      url: string,
      review_date?: string,
      source_type: "factchecker" | "news_media"
    }[]
  }[],
  limitations: string[],           // bv. afkapping, taal, "model kan fouten maken"
  disclaimer: "Dit is een hulpmiddel en geen oordeel. Lees de bronnen zelf na.",
  meta: { model: string, analyzed_words: number, truncated: boolean }
}
```

Wijzig je het schema, pas dan ook de UI én de eval-scripts aan in dezelfde wijziging.

## 6. Technologie

| Onderdeel | Keuze |
|---|---|
| Taal | TypeScript overal (extensie, server, eval) |
| Extensie | Chrome Manifest V3, Vite als bundler, `@mozilla/readability` |
| Server | Kleine serverless functie (Cloudflare Worker of Node/Express), `@anthropic-ai/sdk`, `zod` |
| Factchecks | Google Fact Check Tools API, `GET https://factchecktools.googleapis.com/v1alpha1/claims:search` |
| Package manager | npm |

Google Fact Check API: v1alpha1 (alpha), documentatie laatst bijgewerkt mei 2023. Google faseert
ClaimReview in Search uit (Fact Check Explorer blijft). Bouw de factcheck-stap zo dat een fout of
lege respons de rest van de analyse **niet** blokkeert (dan `no_factcheck_found` + limitation).

## 7. Modellen

Claude Code en OpenCode zijn **bouwtools**. De extensie gebruikt een eigen API-key via de proxy.

Kandidaten voor de evaluatie (zie ROADMAP fase 1):

| Rol | Model | Model-ID |
|---|---|---|
| Goedkoop/snel | Claude Haiku 5.5 | `claude-haiku-5-5` |
| Middenklasse | Claude Sonnet 5.5 | `claude-sonnet-5-5` |
| Sterkst (default) | Claude Opus 5.5 | `claude-opus-5-5` |
| Gratis | 1–2 gratis modellen uit OpenCode (`opencode models`) | n.t.b. |
| Lokaal (optioneel) | model via Ollama | n.t.b. |

Gebruik exact deze ID's, zonder datum-suffix. Maak het model **configureerbaar via env var**
(`LLM_MODEL`), zodat de evaluatie en de extensie hetzelfde pad gebruiken.

Technische aandachtspunten bij de Claude API (huidige API-versie):
- JSON via **structured outputs**: `output_config: { format: ... }` (of `client.messages.parse()`).
  Gebruik niet het verouderde `output_format`, en geen assistant-prefill (geeft een 400).
- `temperature`/`top_p` worden geweigerd (400) op de huidige API-versie. Consistentie meten we dus
  door dezelfde tekst 3× te draaien, niet door temperature 0.
- Opus 5.5 / Haiku 5.5: effort default `medium`. Zet `output_config.effort` expliciet (start `low`
  voor deze classificatietaak, meet of `medium` beter is).
- Controleer altijd `stop_reason` (o.a. `refusal`, `max_tokens`) vóór je de content parseert.
- Gebruik de typed errors van de SDK (`Anthropic.RateLimitError`, …), geen string-matching.

## 8. Datasets en evaluatie (samenvatting)

- **Hoofdset: Baly et al. (2020)**, repo `ramybaly/Article-Bias-Prediction`.
  Waarom: 34.737 Amerikaanse artikelen (links/center/rechts), evenwichtig over onderwerpen en media,
  en een **media-based split** waarbij testartikelen uit uitgevers komen die niet in train zitten.
  Daardoor meten we bias in de inhoud in plaats van herkenning van de uitgever. Het past bij de
  Amerikaanse schaal, en het wordt veel gebruikt, waardoor we resultaten kunnen vergelijken.
  Velden: `ID, topic, source, source_url, url, date, authors, title, content_original, content, bias_text, bias`.
  We gebruiken `content` en strippen `source`, `authors`, `url` vóór het model. Code-licentie: Apache-2.0.
  **Open:** de README zegt niet of labels per artikel of via de uitgever (AllSides) zijn toegekend → paper checken.
- **Gouden set: BiasLab** (300 Amerikaanse artikelen, menselijke labels met onderbouwing). Gebruikt
  als onafhankelijke controle op artikelniveau en om de kwaliteit van de uitleg te beoordelen.
- **Eigen sets (klein):** ~30 claims (deels mét, deels zonder bestaande factcheck), ~30 niet-politieke
  artikelen + ~10 randgevallen (voor `not_political`), spiegelparen voor modelbias.
- **Maten:** macro-F1, verwarringsmatrix (links↔rechts-verwisseling is de ergste fout), consistentie
  over 3 runs, aandeel `uncertain`, kosten en snelheid per analyse.
- **Beslisregel:** het goedkoopste model dat binnen de vooraf afgesproken marge van het beste blijft.

Details en taken: [ROADMAP.md](ROADMAP.md).

## 9. Werkafspraken voor bouwmodellen

- Werk in kleine, testbare stappen volgens ROADMAP.md; vink taken af als ze klaar zijn.
- Commit nooit `.env`, API-keys, datasets of `node_modules`.
- Elke beperking die je tegenkomt (extractie mislukt, API leeg, afkapping) komt in `limitations`
  van de output **en** in de lijst met beperkingen in ROADMAP.md (nodig voor de presentatie).
- Formuleer UI-teksten neutraal: geen "deze bron liegt", wel "factchecker X beoordeelde dit als '…'".
- Twijfel over scope? Kies de kleinste versie en noteer het als open punt in plaats van uit te breiden.
- Code en identifiers in het Engels; documentatie en UI-teksten in het Nederlands, behalve vaste
  schema-strings zoals `scale_note`.
