# Extensie (POC) — branch `extension-poc`

Chrome-extensie (Manifest V3) die **op klik** de hoofdtekst van een Engelstalig artikel
extraheert en het resultaat van de proxy toont: bias-inschatting, claims met factchecks,
beperkingen en de disclaimer.

Dit is de POC-versie uit [docs/POC-PLAN.md](../docs/POC-PLAN.md) (J1–J6). De server hoort
bij Richard (branch `server-poc`, `POST /analyze` op `http://localhost:8080`).

## Bouwen en laden

```bash
cd extension
npm install
npm run build        # vite build (popup) + esbuild (content.js) → extension/dist
```

Daarna in Chrome:

1. `chrome://extensions` → **Ontwikkelaarsmodus** aan.
2. **Uitgepakte extensie laden** → kies `extension/dist`.

Na een wijziging: `npm run build` en in `chrome://extensions` op ↻ klikken.

Overige scripts:

- `npm run typecheck` — TypeScript zonder emit.
- `npm run build:content` — alleen `dist/content.js` opnieuw bundelen.

## Configuratie

Kopieer `.env.example` naar `.env`:

| Variabele | Betekenis |
|---|---|
| `VITE_API_BASE_URL` | Basis-URL van de proxy, standaard `http://localhost:8080`. |
| `VITE_USE_MOCK` | `1` = de popup laadt `src/mock/analysis-result.json` in plaats van de server. |

`VITE_API_BASE_URL` moet passen bij een `host_permissions`-entry in
`public/manifest.json` (nu `http://localhost:8080/*` en `http://127.0.0.1:8080/*`).
Gebruik je een andere poort, pas beide aan.

**Mock-modus** (J5): zet `VITE_USE_MOCK=1`, bouw opnieuw en open de popup. De popup toont
een duidelijke mock-melding, slaat de extractie over en toont de voorbeelddata. Zo is de UI
zonder server of API-key te testen. De fixture kan vervangen worden door de echte response
uit `docs/fixtures/analysis-result.json` (van de server-branch).

## Wat de extensie doet

- Leest de actieve tab **alleen na een klik** op "Analyseer deze pagina".
- Extraheert de hoofdtekst met `@mozilla/readability` (geen navigatie/reclame) en stuurt
  **alleen `{ text }`** naar de server — nooit titel, auteur, URL of domein.
- Toont bias-label + zekerheid + uitleg + citaten, de vaste tekst
  "Links/rechts volgens de Amerikaanse politieke schaal", claims met de **letterlijke**
  rating van de factchecker (of "Geen factcheck gevonden (dit betekent niet dat de claim
  klopt)"), beperkingen en de disclaimer.
- Een statische mascotte (factcheck-ridder) met tekstballon vat de status samen: idle,
  laden, klaar (bias + aantal claims met factcheck), fout of blocklist.
- Bij `not_political`: melding + scale note + disclaimer, **geen** claims-sectie.
- Toont de AllSides-bronrating als **apart** blok (J6, stretch). Dat is een statisch,
  lokaal signaal en gaat niet naar de server; de analyse gebruikt het niet.

## Vormgeving

De popup gebruikt een donker fantasy-thema geïnspireerd op de site van Hack The Future 2026
("The Curse of Achroma"): donkerpaars, elektrisch blauw, neon magenta en oranje, een
pixelart-factcheck-ridder (helm, pluim, schild met vinkje, zwaard) en een tekstballon met
de samenvatting. Er is **geen** affiliatie met Hack The Future; alleen de visuele sfeer is
als inspiratie gebruikt.

Het display-lettertype is **Pirata One** (SIL Open Font License 1.1, Rodrigo Fuenzalida),
lokaal gebundeld in `public/fonts/`. Daardoor doet de popup geen externe fontrequests.
De licentietekst staat in `public/fonts/OFL.txt`. De mascotte is een inline pixel-SVG
(32×32-raster met `shape-rendering="crispEdges"`) in `popup.html`; er zijn geen externe
afbeeldingen.

## Privacy en veiligheid

- Geen API-keys in de extensie; die staan alleen op de proxy.
- Eénmalige privacyverklaring bij de eerste analyse (`chrome.storage.local`).
- Blocklist (`src/blocklist.ts`) voor mail-, bank-, betaal- en overheidsdomeinen: daar
  wordt niets geëxtraheerd en niets verstuurd.
- Permissies minimaal: `activeTab`, `scripting`, `storage`.
- Geen opslag van paginatekst in de extensie; resultaat staat alleen in het popup-venster.
- Externe links openen met `rel="noopener noreferrer"`; alleen `http(s)`-URL's worden links.
- Alle resultaattekst wordt met `textContent` gerenderd (geen `innerHTML`).

## Foutstaten

| Situatie | Melding |
|---|---|
| Minder dan 150 woorden | "Te kort om te analyseren …" (lokale check, geen servercall) |
| Server: `not_english` | "Alleen Engelstalige pagina's worden ondersteund." |
| Readability vindt geen tekst / injectie faalt | "Kon de hoofdtekst van deze pagina niet uitlezen …" |
| Server onbereikbaar / time-out | "De server is niet bereikbaar …" |
| Blocklist-domein | Melding, knop verborgen, niets uitgelezen |
| `chrome://` e.d. | Melding, knop verborgen (behalve in mock-modus) |

## Bestanden

```
public/manifest.json        MV3-manifest (popup.html, permissies, host_permissions)
public/fonts/               Pirata One (woff2) + OFL-licentie
popup.html                  popup-structuur + inline SVG-mascotte
src/popup/main.ts           flow: privacy, blocklist, extractie, fetch, fouten, tekstballon
src/popup/render.ts         resultaatweergave (veilig, zonder innerHTML)
src/popup/styles.css        Achroma-thema (donker, neon, mascotte, tekstballon)
src/content.ts              Readability-extractie; PING/EXTRACT-listener
src/api.ts                  POST /analyze + lichte runtime-validatie + mock
src/types.ts                contracttypes (kopie van server/shared)
src/blocklist.ts            gevoelige domeinen
src/source-ratings.ts       statische AllSides-ratings (J6)
src/mock/analysis-result.json  voorbeelddata voor VITE_USE_MOCK=1
```

## Bekende beperkingen (POC)

- Alleen Engelstalige, gewone http(s)-pagina's. Betaalmuren en sterk dynamische pagina's
  kunnen falen; dan verschijnt de extractie-fout.
- De AllSides-ratings zijn een momentopname (peildatum in de UI) en kunnen wijzigen.
- Geen background service worker: de popup injecteert het content script zelf bij een klik.
- De extensie doet zelf geen taal- of lengtevalidatie boven 20.000 tekens; dat doet de
  server (foutcodes uit het contract worden netjes getoond).
