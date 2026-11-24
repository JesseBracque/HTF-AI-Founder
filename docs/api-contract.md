# API-contract — POC (`server-poc` ↔ `extension-poc`)

Bevroren contract voor de 3-uurs POC (zie [POC-PLAN.md](POC-PLAN.md)). De extensie stuurt
**alleen tekst**; nooit titel, auteur, URL of domein.

- Basis-URL lokaal: `http://localhost:8080` (Traefik → API-container, zie `docker-compose.yml`)
- Content-Type: `application/json`
- CORS: alleen `chrome-extension://*`-origins (`*` voor `OPTIONS`-preflight)

## `POST /analyze`

Request:

```json
{ "text": "<hoofdtekst van de pagina, Engels>" }
```

Response `200`:

```json
{
  "bias": {
    "label": "left | center | right | not_political | uncertain",
    "confidence": 0.0,
    "explanation": "korte neutrale uitleg",
    "evidence": [{ "quote": "letterlijk citaat", "reason": "waarom" }],
    "scale_note": "Left/right according to the US political spectrum."
  },
  "claims": [
    {
      "text": "controleerbare bewering",
      "status": "factcheck_found | no_factcheck_found",
      "factchecks": [
        {
          "publisher": "PolitiFact",
          "publisher_site": "politifact.com",
          "rating_text": "letterlijke rating",
          "title": "...",
          "url": "https://...",
          "review_date": "2024-01-01",
          "source_type": "factchecker | news_media"
        }
      ]
    }
  ],
  "limitations": ["..."],
  "disclaimer": "Dit is een hulpmiddel en geen oordeel. Lees de bronnen zelf na.",
  "meta": { "model": "claude-sonnet-5-5", "analyzed_words": 600, "truncated": false }
}
```

Vaste regels:

- `bias.label === "not_political"` → `claims: []` en **geen** Google-calls.
- `bias.scale_note` is altijd exact `Left/right according to the US political spectrum.`
- `disclaimer` is altijd exact de tekst hierboven.
- `rating_text` is de letterlijke `textualRating` van de factchecker; niet genormaliseerd.
- `claims[].status` is `no_factcheck_found` als Google niets vond **of** de call faalde
  (dan staat er een limitation bij).
- Hoe factchecks gevonden worden (server-intern, verandert het contract niet): per claim
  zoekt de server bij Google met de volledige claimzin én met een korte zoekterm van 3–6
  trefwoorden die het model meelevert. Een tweede, kleine modelaanroep controleert per
  gevonden factcheck of die over **dezelfde specifieke bewering** gaat (zonder de rating te
  zien); alleen die blijven over, maximaal 5 per claim. Mislukt die controle, dan tonen we
  ongefilterd met een limitation.
- Geen paginatekst in logs of opslag.

## Grenzen

| Regel | Waarde | Gedrag |
|---|---|---|
| Minimum | 150 woorden | `422` met `too_short` |
| Maximum | 3.000 woorden | afkappen aan het einde; `meta.truncated = true`; limitation erbij |
| Harde limiet | 20.000 tekens | `413` met `too_long` |
| Taal | alleen `en` | anders `422` met `not_english` |

## Fouten

Vorm:

```json
{ "error": { "code": "too_short", "message": "..." } }
```

| Code | HTTP | Betekenis |
|---|---|---|
| `too_short` | 422 | Minder dan 150 woorden |
| `not_english` | 422 | Taal is niet Engels |
| `too_long` | 413 | Meer dan 20.000 tekens |
| `invalid_response` | 502 | Model gaf geen schema-geldige JSON (na één retry) |
| `upstream_error` | 502 | Gateway/model/Google onbereikbaar of onverwacht antwoord |
| `bad_request` | 400 | Body is geen geldige JSON of `text` ontbreekt *(POC-aanvulling)* |
| `rate_limited` | 429 | Meer dan 20 verzoeken/minuut per client *(POC-aanvulling)* |

> **Aanvulling t.o.v. het plan:** `bad_request` en `rate_limited` zijn toegevoegd. Onbekende codes
> moeten in de extensie als generieke fout worden getoond.

## `GET /health`

```json
{ "ok": true }
```

## Fixtures

- `docs/fixtures/article-en.txt` — politiek Engels testartikel (input voor R2/R7)
- `docs/fixtures/request.json` — kant-en-klare request-body (`{ "text": "..." }`)
- `docs/fixtures/analysis-result.json` — echte response, door Richard opgeslagen voor Jesse (mock)

## Testen vanaf de command line

```bash
# Bash / zsh
curl -s http://localhost:8080/health
curl -s -X POST http://localhost:8080/analyze -H 'content-type: application/json' --data-binary @docs/fixtures/request.json
```

```powershell
# PowerShell: curl.exe (niet `curl`) en alles op één regel
curl.exe -s http://localhost:8080/health
curl.exe -s -X POST http://localhost:8080/analyze -H "content-type: application/json" --data-binary "@docs/fixtures/request.json"
# of native:
Invoke-RestMethod -Uri http://localhost:8080/analyze -Method Post -ContentType 'application/json' -InFile docs/fixtures/request.json
```
