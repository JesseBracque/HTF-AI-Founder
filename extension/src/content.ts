/**
 * Content script: haalt op verzoek de hoofdtekst uit de pagina.
 *
 * Wordt pas geïnjecteerd nadat de gebruiker in de popup op "Analyseer deze
 * pagina" klikt (chrome.scripting.executeScript). Stuurt alleen tekst terug —
 * nooit titel, auteur, URL of domein.
 */
import { Readability } from "@mozilla/readability";
import type { ExtractResponse } from "./types";

const globalScope = globalThis as typeof globalThis & {
  __htfContentScriptLoaded?: boolean;
};

// Voorkomt dubbele listeners als de popup het script per ongeluk nog eens
// injecteert; de popup pingt eerst en injecteert alleen als dat nodig is.
if (!globalScope.__htfContentScriptLoaded) {
  globalScope.__htfContentScriptLoaded = true;

  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    const type = (message as { type?: unknown } | null)?.type;

    if (type === "PING") {
      sendResponse({ ok: true });
      return;
    }

    if (type !== "EXTRACT") {
      return;
    }

    let response: ExtractResponse;
    try {
      // Lees van een kloon: Readability mag de echte pagina niet aanpassen.
      const clone = document.cloneNode(true) as Document;
      const article = new Readability(clone).parse();
      const text = (article?.textContent ?? "")
        .replace(/\r\n?/g, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      response = text.length > 0
        ? { ok: true, text }
        : { ok: false, reason: "empty" };
    } catch {
      response = { ok: false, reason: "error" };
    }

    sendResponse(response);
  });
}
