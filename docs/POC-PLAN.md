# Plan — 3-uurs POC, twee branches voor Richard en Jesse

## Context

Proof of concept, geen productieversie. Binnen **3 uur** bouwen **Richard** en **Jesse** elk één
branch, met een klein bevroren contract ertussen. Daarna mergen en samen de demo droogdraaien.
Tokengebruik blijft laag: één LLM-call per analyse, alleen fixture- en demopagina's, geen
dataset-evaluatie.

Vaste keuzes:

- **Alleen politieke artikelen.** `not_political` → melding, **geen** claims en **geen** Google-calls.
- **Claude Sonnet 5.5** (`claude-sonnet-5-5`) via de bestaande **R33-gateway** en API-key.
- **Docker Compose + Traefik** als enige ingang; geen losse Node-server of gepubliceerde API-poort.
- **AllSides** als enige bronrating, statisch en apart getoond (CC BY-NC 4.0) — stretch voor Jesse.
- Grenzen: 150–3.000 woorden; harde limiet 20.000 tekens; alleen Engels.

## Werkafspraak

| Branch | Eigenaar | Levert | Mag aanpassen |
|---|---|---|---|
| `server-poc` | **Richard** | Lokale API via Docker Compose + Traefik: tekst → gevalideerde JSON | `server/`, `shared/`, `docker-compose.yml`, `server/Dockerfile`, `docs/api-contract.md` |
| `extension-poc` | **Jesse** | Chrome-extensie: op klik tekst extraheren en resultaat tonen | `extension/` |

- Richard zet het contract + `shared/` **eerst** op `main` (10 min); daarna vertakken beiden.
- Geen edits in elkaars map. Contractwijziging = Richard doet een kleine commit op `main`;
  Jesse rebase't en past alleen de extensie aan.
- Integratie pas als beide branches hun eigen acceptatie halen.

## Contract (Richard zet dit vooraf neer, Jesse leest het)

`POST /analyze` met `{ "text": "..." }` → `200` met:

```json
{
  "bias": {
    "label": "left | center | right | not_political | uncertain",
    "confidence": 0.0,
    "explanation": "korte neutrale uitleg",
    "evidence": [{ "quote": "letterlijk citaat", "reason": "waarom" }],
    "scale_note": "Left/right according to the US political spectrum."
  },
  "claims": [{
    "text": "controleerbare bewering",
    "status": "factcheck_found | no_factcheck_found",
    "factchecks": [{
      "publisher": "PolitiFact", "publisher_site": "politifact.com",
      "rating_text": "letterlijke rating", "title": "...", "url": "https://...",
      "review_date": "2024-01-01", "source_type": "factchecker"
    }]
  }],
  "limitations": ["..."],
  "disclaimer": "Dit is een hulpmiddel en geen oordeel. Lees de bronnen zelf na.",
  "meta": { "model": "claude-sonnet-5-5", "analyzed_words": 600, "truncated": false }
}
```

- `bias.label === "not_political"` → `claims: []` en geen Google-calls.
- Fouten: `{ "error": { "code": "too_short | not_english | too_long | invalid_response | upstream_error", "message": "..." } }`.
- De extensie stuurt **alleen tekst**; nooit titel, auteur, URL of domein.
- Bestanden: `shared/types.ts`, `shared/constants.ts`, `docs/api-contract.md`,
  `docs/fixtures/article-en.txt`.

## Branch `server-poc` — Richard (~90 min)

**Opdracht:** één commando start de proxy; `POST /analyze` geeft schema-geldige JSON.

- [x] **R1 Contract + fundament (10 min).** Docs-mini bijwerken (Docker+Traefik, Sonnet 5.5,
      `not_political`, AllSides), `shared/types.ts`, `shared/constants.ts`,
      `docs/api-contract.md`, fixture-artikel. Daarna `main` pushen en vertakken.
- [x] **R2 Gateway-smoketest (15 min).** `server/scripts/smoke.ts`: `messages.parse` met mini-schema,
      `claude-sonnet-5-5`, `output_config.effort: "low"`, `max_tokens: 300`; check `stop_reason`.
      Fallback als de gateway geen structured outputs doet: JSON-in-prompt + zod-parse.
      *Uitkomst: gateway vereist provider-prefix `anthropic/claude-sonnet-5-5`; structured outputs werken.*
- [x] **R3 Preprocess + schema (20 min).** `server/src/schema.ts` (zod) en `pipeline.ts`:
      <150 woorden → `too_short`; afkappen op 3.000 + limitation; >20.000 tekens → 413;
      taal via `franc`; best-effort strip van "By …"-regels en URL's.
- [x] **R4 Analyse (25 min).** Eén `messages.parse` met `zodOutputFormat`: bias + 3–5 claims +
      citaten. `max_tokens: 1600`, `effort: "low"`, `stop_reason` checken, typed SDK-errors,
      één retry. `not_political` → claims leeg, factcheck overslaan.
- [x] **R5 Factchecks (15 min).** Per claim parallel `claims:search?languageCode=en&pageSize=3`,
      `AbortSignal.timeout(4000)`. Map `textualRating` **letterlijk**, publisher, site, titel, URL,
      reviewDate; dedupe op URL. Fout/leeg → `no_factcheck_found` + limitation.
- [x] **R6 API + Docker/Traefik (10 min).** `POST /analyze`, body-limit, zod-validatie,
      CORS alleen `chrome-extension://*`, in-memory rate limit 20/min, geen paginatekst loggen.
      Compose met `traefik` (catch-all `PathPrefix(/)` → `api`, poort `${TRAEFIK_PORT:-8080}:80`,
      socket read-only) en `api` zonder host-poort. `.env.example` bijwerken.
      *Let op: Traefik v3.8.0 nodig — v3.3 kan niet met Docker Engine 29 praten (lege daemon-fout).*
- [x] **R7 Opleveren (5 min).** `curl` met de fixture werkt; één echte response opslaan als
      `docs/fixtures/analysis-result.json` voor Jesse; URL + voorbeeld in de branch-PR zetten.
      *Getest via `npm start` én via Traefik op `localhost:8080` (health 200, analyse 200, ~8,5 s).*

**Klaar als:** `docker compose up -d --build` + `curl http://localhost:8080/analyze` binnen ~10 s
geldige JSON geeft; niet-politiek `claims: []` oplevert; een Google-fout de analyse niet blokkeert;
geen key of paginatekst in logs/repo staat.

## Branch `extension-poc` — Jesse (~90 min)

**Opdracht:** extensie laadt in Chrome, extraheert op klik de hoofdtekst en toont het API-resultaat.

- [ ] **J1 Manifest + builds (20 min).** `extension/public/manifest.json` (MV3; `activeTab`,
      `scripting`, `storage`; host_permissions `http://localhost:8080/*`; popup `index.html`).
      `vite build` voor de popup + `esbuild src/content.ts --bundle --format=iife --outfile=dist/content.js`.
      Eén `npm run build` doet beide; `dist/` laden via `chrome://extensions`.
- [ ] **J2 Extractie (20 min).** `src/content.ts`: `@mozilla/readability` op
      `document.cloneNode(true)`, luistert op `EXTRACT`, stuurt alleen `{ text }` terug.
      Popup injecteert via `chrome.scripting.executeScript` na klik en gebruikt daarna
      `chrome.tabs.sendMessage`; re-injectie voorkomen.
- [ ] **J3 Popup + privacy + blocklist (20 min).** Nederlands, neutraal. Privacyverklaring één keer
      (`chrome.storage.local`), knop "Analyseer deze pagina", loading, blocklist voor mail/bank/
      betaalproviders vóór injectie, `fetch` naar `${VITE_API_BASE_URL}/analyze`.
- [ ] **J4 Weergave + fouten (20 min).** Bias-label, zekerheid, uitleg, citaten; vaste tekst
      "Links/rechts volgens de Amerikaanse politieke schaal"; claims met letterlijke rating + link
      of "Geen factcheck gevonden (dit betekent niet dat de claim klopt)"; limitations; disclaimer.
      `not_political`: melding + scale note + disclaimer, geen claims-sectie.
      Foutstaten: te kort, geen Engels, extractie mislukt, server onbereikbaar.
- [ ] **J5 Mock + testen (10 min).** `VITE_USE_MOCK=1` laadt `docs/fixtures/analysis-result.json`,
      zodat de UI zonder API-tokens getest kan worden. Daarna tegen Richards echte server testen.
- [ ] **J6 Stretch — AllSides (15 min, alleen als J1–J5 klaar zijn).**
      `src/source-ratings.ts` met ~10 uitgevers (rating, bron-URL, peildatum, CC BY-NC 4.0).
      Apart blok "Bronrating (apart signaal, niet gebruikt voor de analyse)"; niet naar de server.

**Klaar als:** op een politiek artikel de flow van klik tot resultaat werkt; privacy één keer
verschijnt; `not_political` geen claims toont; blocklist en foutstaten werken; er gaat geen
titel/auteur/URL naar de server.

## Integratie (samen, ~30 min)

- [ ] **I1** Richard merget `server-poc`; Jesse merget daarna `extension-poc` (alleen root-docs
      kunnen botsen).
- [ ] **I2** `docker compose up -d --build`; extensie laden; testen op 2 politieke artikelen,
      1 niet-politiek artikel en 1 bloklist-site.
- [ ] **I3** CORS/extractie/poort fixen; foutstaten droogdraaien; latency noteren voor de demo.
- [ ] **I4** Demo klaarzetten: 2 voorbereide artikelen, ingevulde `.env`, back-up screenshot.

## Verificatie

```bash
docker compose up -d --build
curl -s http://localhost:8080/health
curl -s -X POST http://localhost:8080/analyze -H 'content-type: application/json' \
  --data-binary @docs/fixtures/request.json
cd extension && npm install && npm run build   # chrome://extensions → dist/
```

## Tokenbudget

- Eén analyse = ~500 prompttokens + ≤4.000 teksttokens + ≤1.600 outputtokens.
- Alleen fixture + 2 demo-artikelen analyseren; Jesse's UI-werk via de mock.
- `effort: "low"`, `max_tokens: 1600`, 3–5 claims, korte uitleg. Geen evaluatieruns.

## Risico's

| Risico | Mitigatie |
|---|---|
| R33-gateway ondersteunt geen structured outputs | R2 eerst; fallback JSON-in-prompt + zod. |
| Gelekte key in git-geschiedenis | Richard roteert de key vóór R2; alleen in `.env`. |
| Poort 8080 bezet | `TRAEFIK_PORT` in `.env` + zelfde poort in `VITE_API_BASE_URL`. |
| Readability faalt op betaalmuur/dynamische pagina | Foutstate tonen; demo-artikelen vooraf testen. |
| Tijd tekort | J6 (AllSides) en J5 (mock) schrappen; kern is bias + claims + factchecks. |

## Definition of done (POC)

1. Eén `docker compose up -d --build` start Traefik + API; geen losse server of API-poort.
2. Extensie analyseert op klik een politiek artikel en toont bias, 3–5 claims met letterlijke
   factcheck-ratings (of "geen factcheck gevonden"), limitations en de disclaimer.
3. `not_political` toont een melding en doet geen claims/factchecks.
4. Privacyverklaring, blocklist en foutstaten werken; geen keys of paginatekst in repo/logs.
5. Beide branches zijn gemerged en de demo is binnen 3 uur drooggedraaid.
