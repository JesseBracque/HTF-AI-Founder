# ROADMAP — Bias & Factcheck Extensie

Bouwvolgorde met acceptatiecriteria. Context en harde regels: [CLAUDE.md](CLAUDE.md).

Prioriteiten:
- **P0** = minimale demo, moet af
- **P1** = belangrijk voor een geloofwaardige presentatie
- **P2** = stretch, vervalt eerst bij tijdnood

Status: `[ ]` open · `[~]` bezig · `[x]` klaar

---

## Fase 0 — Repo & beslissingen vastleggen (P0)

- [ ] Root `.gitignore`: `.env`, `node_modules/`, `eval/data/`, `dist/`
- [ ] `.env.example` met lege `ANTHROPIC_API_KEY`, `GOOGLE_FACTCHECK_API_KEY`, `LLM_MODEL`
- [ ] **Gelekte key roteren**: de commit `fb4fee8` bevat `.env` met `R33_API_KEY`. Verwijderen uit de
      werkmap is niet genoeg, want hij staat in de git-geschiedenis (en mogelijk op GitHub). Vraag een nieuwe key aan.
- [ ] Mappen `extension/`, `server/`, `eval/`, `docs/` aanmaken (zie CLAUDE.md §4)

**Klaar als:** `git status` toont geen secrets, iedereen kan lokaal `npm install` draaien.

## Fase 1 — Modelevaluatie (P0, deels P1)

Doel: beslissen welk model in de extensie komt, en de cijfers hebben voor de presentatie.

- [ ] **P0** Baly-data downloaden naar `eval/data/` (niet committen). Media-split gebruiken.
- [ ] **P0** Gestratificeerde steekproef: ~300 artikelen (100 links / 100 center / 100 rechts) uit de
      media-split testset. Verdeling: ~60 voor prompt-tuning, ~240 apart voor de eindmeting.
      Hele uitgevers niet over beide delen verdelen.
- [ ] **P0** Eerste versie codebook-prompt + structured-output schema (`server/src/prompts/`, `server/src/schema.ts`)
- [ ] **P0** Eval-runner `eval/run.ts`: hergebruikt `server/src/pipeline` (zelfde strip + 3.000-woordengrens),
      schrijft per model een `eval/results/<model>.json`
- [ ] **P0** Draaien op: `claude-haiku-5-5`, `claude-sonnet-5-5`, `claude-opus-5-5`
- [ ] **P1** Draaien op 1–2 gratis OpenCode-modellen (gebruik geen gevoelige data, want gratis modellen bewaren data)
- [ ] **P0** Metrics-script: macro-F1, verwarringsmatrix, aandeel links↔rechts-verwisselingen, kosten/analyse, latency
- [ ] **P1** Consistentie: 50 artikelen × 3 runs, % identieke labels
- [ ] **P1** BiasLab (300) als onafhankelijke gouden set
- [ ] **P1** Spiegelparen (~20): zelfde claim links en rechts geformuleerd. Verschuift de score structureel → model ongeschikt
- [ ] **P1** Niet-politieke set: ~30 artikelen (sport/wetenschap/cultuur) + ~10 randgevallen (economie/klimaat)
- [ ] **P2** Lokaal model via Ollama
- [ ] **P2** Gefinetunede RoBERTa als referentie-baseline

**Beslisregel (vooraf vastleggen, vóór de eerste meting!):** we kiezen het goedkoopste model dat
maximaal **5 procentpunt macro-F1** onder het beste model zit **én** niet vaker links↔rechts
verwisselt. Kleinere verschillen dan ~5 punten (totaal) of ~9 punten (per klasse) zijn bij deze
steekproefgrootte niet betekenisvol.

**Klaar als:** `eval/results/summary.md` met tabel per model en de gekozen `LLM_MODEL`.

## Fase 2 — Proxy-server (P0)

- [ ] `POST /analyze` met body `{ text: string, lang?: string }`
- [ ] Validatie: 150–3.000 woorden (afkappen + limitation), harde limiet 20.000 tekens (413), taal ≠ en → melding
- [ ] Strip uitgever/URL/byline (best effort op tekstniveau; extensie stuurt die al niet mee)
- [ ] Eén LLM-call → claims + bias via structured outputs; check `stop_reason`
- [ ] Google Fact Check `claims:search` per claim, **parallel**, met timeout (~4 s per call)
- [ ] Fout of lege respons van Google → `no_factcheck_found` + limitation, analyse gaat door
- [ ] Output valideren met zod-schema; bij ongeldige JSON één retry, daarna nette foutmelding
- [ ] CORS alleen voor de extensie-origin, simpele rate limit (bv. 20 req/min per client)
- [ ] Geen paginatekst loggen

**Klaar als:** `curl` met een testartikel geeft binnen ~10 s geldige JSON volgens het schema.

## Fase 3 — Extensie (P0)

- [ ] MV3 `manifest.json`, permissies minimaal (`activeTab`, `scripting`, `storage`)
- [ ] Content script met `@mozilla/readability`: hoofdtekst, geen navigatie/reclame, geen titel/auteur/domein meesturen
- [ ] Blocklist gevoelige domeinen (mail, bank, …), daar wordt niets uitgelezen
- [ ] Popup: knop "Analyseer deze pagina", privacymelding vóór de eerste analyse
- [ ] Resultaatweergave:
  - bias-label + zekerheid + uitleg + citaten
  - vaste tekst "Links/rechts volgens de Amerikaanse politieke schaal"
  - claims met factchecker, rating **letterlijk**, klikbare link; of "Geen factcheck gevonden (dit betekent niet dat de claim klopt)"
  - limitations
  - disclaimer: "Dit is een hulpmiddel en geen oordeel. Lees de bronnen zelf na."
- [ ] Laad- en foutstatus (te kort, geen Engels, extractie mislukt, server niet bereikbaar)

**Klaar als:** op 3 nieuwssites werkt de flow van klik tot resultaat.

## Fase 4 — Testen na bouwen (P1)

- [ ] Extractietest op 10–20 sites (incl. betaalmuur en dynamische pagina's). Noteer welke falen.
- [ ] Claimtest: ~30 claims (deels mét, deels zonder factcheck). Meet: vindt de zoekstap de juiste
      factcheck? Wordt het systeem niet te stellig bij claims zonder factcheck?
- [ ] Gemeten latency en kosten per analyse in de echte extensie

## Fase 5 — Stretch (P2)

- [ ] Bronrating van de uitgever als extra signaal: handmatige lijst van ~25 grote Amerikaanse
      uitgevers met bronvermelding (AllSides: CC BY-NC 4.0, alleen niet-commercieel). Wordt apart getoond en
      vervangt de analyse niet.
- [ ] Webzoeken naar nieuwsmedia voor claims zonder factcheck
- [ ] Eigen key invoeren in de extensie-opties voor een lokale demo (met waarschuwing)

## Fase 6 — Presentatie (P0)

- [ ] Resultatentabel uit fase 1 + gekozen model + motivatie
- [ ] Lijst met beperkingen (hieronder), aangevuld met wat we tijdens het bouwen vonden
- [ ] Live demo op 1–2 voorbereide pagina's (en een back-up screenshot/video)

---

## Bij tijdnood vervalt (in deze volgorde)

1. Fase 5 volledig
2. Ollama, RoBERTa-baseline
3. BiasLab-meting (dan als beperking vermelden: "alleen gemeten op Baly")
4. Gratis OpenCode-modellen (dan: "alleen Claude-modellen vergeleken")
5. Consistentiemeting terugschalen naar 20 artikelen

Het **minimale product** is: fase 0 + Baly-meting op 3 Claude-modellen + proxy + extensie met
bias-analyse en Google-factchecks + disclaimer.

## Open punten

| # | Punt | Wie/hoe | Blokkeert |
|---|---|---|---|
| 1 | Hoeveel tijd tot de presentatie (uren/dagen)? Bepaalt welke P1-taken haalbaar zijn | team | planning |
| 2 | Baly-labels: per artikel of geërfd van de uitgever? De README zegt het niet. Lees het datasetdeel van het paper (Baly et al., 2020, EMNLP) | 10 min lezen | interpretatie resultaten |
| 3 | Google Fact Check API: kosten/quota. Niet vermeld in de docs. Maak een key en bekijk de quota in de Google Cloud Console | 5 min | fase 2 |
| 4 | Welke provider zit achter de ontvangen key (`R33_API_KEY`, "route33")? Directe Anthropic-key of een gateway? Bepaalt de SDK-configuratie (`baseURL`) | team | fase 1 |
| 5 | Server-hosting: Cloudflare Worker of lokaal Node? Voorstel: lokaal Node voor de demo, Worker als het snel lukt | team | fase 2 |
| 6 | Hoe ziet BiasLab zijn klassenverdeling eruit, en welke licentie heeft het? | bij download | fase 1 (P1) |
| 7 | Welke gratis modellen biedt jullie OpenCode-installatie? (`opencode models`) | 2 min | fase 1 (P1) |

## Beperkingen (voor de presentatie, aanvullen tijdens het bouwen)

- Alleen Engelstalige pagina's. Andere talen zijn niet getest en worden geweigerd.
- Links/rechts volgens de **Amerikaanse** schaal, niet zomaar toepasbaar op Belgische/Europese politiek.
- Baly-data komt uit het AllSides-archief tot ~2020: verouderde nieuwsrealiteit, en modellen kunnen
  deze artikelen al uit hun trainingsdata kennen (mogelijk te optimistische scores).
- Baly-labels zijn mogelijk (deels) afgeleid van de uitgever en niet van het artikel zelf (open punt 2).
- We strippen de uitgever, maar een model kan de schrijfstijl van een uitgever toch herkennen.
- Kleine evaluatieset: foutmarge ±5 procentpunt totaal, ±9 per klasse.
- Modellen verschillen onderling en hebben eigen politieke voorkeuren (gemeten met spiegelparen).
- Google Fact Check API: alpha-versie, beperkte dekking, alleen al gecheckte claims.
  "Geen factcheck gevonden" betekent niet "klopt".
- Ratings van factcheckers zijn niet genormaliseerd: elke factchecker gebruikt een eigen schaal.
- Een gevonden factcheck kan over een **tegengestelde formulering** van de claim gaan: Google zoekt
  op de gecheckte bewering, dus een rating als "False" kan bij een ware claim terechtkomen. Daarom
  staat er in elk resultaat met factchecks een extra limitation; lees altijd de bron.
- Google Fact Check zoekt op trefwoorden, niet op betekenis: een gevonden factcheck kan over een
  ander maar gelijkaardig onderwerp gaan (bv. claim over "CBO-raming" → factcheck over een ander
  wetsvoorstel), en lange claimzinnen leveren vaak niets op. Claims moeten Engels zijn
  (`languageCode=en`); de prompt dwingt dat af.
- Google Fact Check-key is niet beperkt tot een IP-adres (server-IP nog onbekend); alleen tot de API.
- Analyse beperkt tot de eerste 3.000 woorden; teksten onder 150 woorden worden niet geanalyseerd.
- Tekstextractie kan falen op betaalmuren en dynamische pagina's.
- Paginatekst gaat naar externe diensten (AI-provider, Google).
