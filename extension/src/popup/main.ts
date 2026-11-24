import "./styles.css";
import { AnalyzeApiError, USE_MOCK, analyzeText } from "../api";
import { isBlockedHost, parseHostname } from "../blocklist";
import { getSourceRating } from "../source-ratings";
import type { AnalysisResult, ExtractResponse } from "../types";
import {
  clearResults,
  renderBubbleChips,
  renderResult,
  showError,
} from "./render";

const MIN_WORDS = 150;
const PRIVACY_STORAGE_KEY = "privacyAccepted:v1";

/** Lokale fout met een tekst die rechtstreeks aan de gebruiker getoond mag worden. */
class LocalAnalyzeError extends Error {}

function getEl<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error(`Element #${id} ontbreekt in popup.html`);
  }
  return node as T;
}

const els = {
  privacyPanel: getEl<HTMLElement>("privacy-panel"),
  mainPanel: getEl<HTMLElement>("main-panel"),
  acceptPrivacy: getEl<HTMLButtonElement>("accept-privacy"),
  mockNotice: getEl<HTMLElement>("mock-notice"),
  siteLine: getEl<HTMLElement>("site-line"),
  analyze: getEl<HTMLButtonElement>("analyze"),
  blocked: getEl<HTMLElement>("blocked"),
  results: getEl<HTMLElement>("results"),
  bubble: getEl<HTMLElement>("bubble"),
  bubbleText: getEl<HTMLElement>("bubble-text"),
  bubbleChips: getEl<HTMLElement>("bubble-chips"),
};

let currentHost: string | undefined;

type BubbleMode = "idle" | "loading" | "result" | "error";

/** Laat de mascotte "praten": status, samenvatting of fout. */
function setBubble(text: string, mode: BubbleMode = "idle"): void {
  els.bubbleText.textContent = text;
  els.bubble.classList.toggle("loading", mode === "loading");
  els.bubble.classList.toggle("error", mode === "error");

  if (mode !== "result") {
    els.bubbleChips.replaceChildren();
    els.bubbleChips.hidden = true;
  }
}

function showResultBubble(result: AnalysisResult): void {
  setBubble("Klaar! Dit vond ik.", "result");
  renderBubbleChips(els.bubbleChips, result);
}

function setBusy(busy: boolean): void {
  els.analyze.disabled = busy;
  els.analyze.textContent = busy ? "Bezig…" : "Analyseer deze pagina";
  els.mainPanel.setAttribute("aria-busy", String(busy));
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/**
 * Leest de huidige tab, past de blocklist toe en verbergt de knop waar nodig.
 * Retourneert of er geanalyseerd mag worden.
 */
async function refreshTab(): Promise<boolean> {
  const tab = await getActiveTab();
  currentHost = tab?.url ? parseHostname(tab.url) : undefined;

  const blocked = isBlockedHost(currentHost);
  const analyzable = USE_MOCK || currentHost !== undefined;

  els.siteLine.textContent = currentHost ? `Pagina: ${currentHost}` : "";
  els.analyze.hidden = blocked || !analyzable;
  els.blocked.hidden = !blocked && analyzable;

  if (blocked) {
    els.blocked.textContent =
      "Deze site staat op de blocklist (mail, bank of betaalprovider). De extensie leest hier niets uit en stuurt niets door.";
    clearResults(els.results);
    setBubble("Deze pagina sla ik over — daar lees ik niets uit.");
  } else if (!analyzable) {
    els.blocked.textContent =
      "Op deze pagina kan de extensie niet analyseren (alleen gewone http- en https-pagina's).";
    clearResults(els.results);
    setBubble("Op deze pagina kan ik niets doen. Open een gewoon artikel.");
  } else {
    setBubble("Klaar om deze pagina te doorzoeken?");
  }

  return !blocked && analyzable;
}

async function showMainPanel(): Promise<void> {
  els.privacyPanel.hidden = true;
  els.mainPanel.hidden = false;
  await refreshTab();
}

/**
 * Injecteert het content script alleen als het nog niet aanwezig is. De
 * aanwezigheid wordt gecheckt met een PING, zodat herhaald klikken geen
 * dubbele listeners oplevert.
 */
async function ensureContentScript(tabId: number): Promise<void> {
  try {
    const pong = (await chrome.tabs.sendMessage(tabId, {
      type: "PING",
    })) as { ok?: boolean } | undefined;
    if (pong?.ok) {
      return;
    }
  } catch {
    // Nog niet geïnjecteerd op deze pagina.
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
  } catch {
    throw new LocalAnalyzeError(
      "De extensie kan deze pagina niet uitlezen. Probeer het op een gewone nieuwssite of herlaad de pagina.",
    );
  }
}

async function extractText(tabId: number): Promise<string> {
  await ensureContentScript(tabId);

  let response: ExtractResponse | undefined;
  try {
    response = (await chrome.tabs.sendMessage(tabId, {
      type: "EXTRACT",
    })) as ExtractResponse | undefined;
  } catch {
    throw new LocalAnalyzeError(
      "Kon geen verbinding maken met de pagina. Herlaad de pagina en probeer opnieuw.",
    );
  }

  if (!response?.ok || !response.text.trim()) {
    throw new LocalAnalyzeError(
      "Kon de hoofdtekst van deze pagina niet uitlezen. Werkt dit op een artikel zonder betaalmuur?",
    );
  }

  return response.text.trim();
}

function errorMessage(error: unknown): string {
  if (error instanceof LocalAnalyzeError) {
    return error.message;
  }

  if (error instanceof AnalyzeApiError) {
    switch (error.code) {
      case "too_short":
        return `De tekst is te kort om te analyseren (minimaal ${MIN_WORDS} woorden).`;
      case "not_english":
        return "Alleen Engelstalige pagina's worden ondersteund.";
      case "too_long":
        return "De tekst is te lang voor de server (max. 20.000 tekens).";
      case "invalid_response":
        return "De server gaf een ongeldig antwoord. Probeer het opnieuw.";
      case "upstream_error":
        return "De analyse is tijdelijk niet beschikbaar (fout bij de AI- of factcheckdienst). Probeer het later opnieuw.";
      case "bad_request":
        return "De server kon het verzoek niet lezen. Probeer het opnieuw.";
      case "rate_limited":
        return "Te veel analyses kort na elkaar. Probeer het over een minuut opnieuw.";
      case "network_error":
        return "De server is niet bereikbaar. Controleer of de proxy draait.";
    }
  }

  return "Er ging iets mis. Probeer het opnieuw.";
}

async function runAnalysis(): Promise<void> {
  setBusy(true);
  clearResults(els.results);

  try {
    // Altijd opnieuw checken: blocklist geldt ook in mock-modus.
    const canAnalyze = await refreshTab();
    if (!canAnalyze) {
      return;
    }

    setBubble("Ik speur de tekst af", "loading");

    if (USE_MOCK) {
      // UI testen zonder server of API-key (J5).
      const result = await analyzeText("");
      renderResult(els.results, result, getSourceRating(currentHost));
      showResultBubble(result);
      return;
    }

    const tab = await getActiveTab();
    if (typeof tab?.id !== "number") {
      throw new LocalAnalyzeError(
        "Kon het actieve tabblad niet vinden. Open een artikel en probeer opnieuw.",
      );
    }

    const text = await extractText(tab.id);
    const words = countWords(text);

    if (words < MIN_WORDS) {
      showError(
        els.results,
        `Te kort om te analyseren: deze pagina heeft ${words} woorden, minimaal ${MIN_WORDS} nodig.`,
      );
      setBubble("Dit is te weinig tekst om iets over te zeggen.", "error");
      return;
    }

    const result = await analyzeText(text);
    renderResult(els.results, result, getSourceRating(currentHost));
    showResultBubble(result);
  } catch (error) {
    showError(els.results, errorMessage(error));
    setBubble("Oeps, dat lukte niet.", "error");
  } finally {
    setBusy(false);
  }
}

async function init(): Promise<void> {
  els.mockNotice.hidden = !USE_MOCK;

  const stored = await chrome.storage.local.get(PRIVACY_STORAGE_KEY);
  if (stored[PRIVACY_STORAGE_KEY] === true) {
    await showMainPanel();
    return;
  }

  els.privacyPanel.hidden = false;
  els.mainPanel.hidden = true;
  setBubble("Voordat ik mag rondkijken, moet je dit even weten.");
}

els.acceptPrivacy.addEventListener("click", () => {
  void (async () => {
    await chrome.storage.local.set({ [PRIVACY_STORAGE_KEY]: true });
    await showMainPanel();
  })();
});

els.analyze.addEventListener("click", () => {
  void runAnalysis();
});

void init();
