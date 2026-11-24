/**
 * Resultaatweergave. Alles wordt met textContent opgebouwd: er komt geen
 * ongevalideerde tekst via innerHTML in de popup.
 */
import type {
  AnalysisResult,
  BiasLabel,
  Claim,
  Factcheck,
} from "../types";
import type { SourceRating } from "../source-ratings";

const LABELS: Record<BiasLabel, string> = {
  left: "Links",
  center: "Midden",
  right: "Rechts",
  not_political: "Niet-politiek",
  uncertain: "Onzeker",
};

const FALLBACK_DISCLAIMER =
  "Dit is een hulpmiddel en geen oordeel. Lees de bronnen zelf na.";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function append(parent: ParentNode, ...children: (Node | string)[]): void {
  parent.append(...children);
}

/** Alleen http(s)-URL's als link tonen; alles anders als platte tekst. */
function safeHttpUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

function linkNode(text: string, url: string): HTMLElement {
  const href = safeHttpUrl(url);
  if (!href) {
    return el("span", undefined, text);
  }
  const anchor = el("a", undefined, text);
  anchor.href = href;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  return anchor;
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

/**
 * Korte samenvatting in de tekstballon van de mascotte: bias-label met
 * zekerheid en hoeveel claims een factcheck hebben.
 */
export function renderBubbleChips(
  container: HTMLElement,
  result: AnalysisResult,
): void {
  container.replaceChildren();

  const label = result.bias.label;
  const certainty = Math.round(clampConfidence(result.bias.confidence) * 100);
  const chips: HTMLElement[] = [
    el("span", `chip chip--${label}`, `${LABELS[label]} · ${certainty}%`),
  ];

  if (label === "not_political") {
    chips.push(el("span", "chip", "Geen claims of factchecks"));
  } else {
    const total = result.claims.length;
    if (total === 0) {
      chips.push(el("span", "chip", "Geen claims gevonden"));
    } else {
      const withFactcheck = result.claims.filter(
        (claim) =>
          claim.status === "factcheck_found" && claim.factchecks.length > 0,
      ).length;
      chips.push(
        el("span", "chip", `${withFactcheck} van ${total} claims met factcheck`),
      );
    }
  }

  container.append(...chips);
  container.hidden = false;
}

export function clearResults(container: HTMLElement): void {
  container.replaceChildren();
  container.hidden = true;
}

export function showError(container: HTMLElement, message: string): void {
  clearResults(container);
  const box = el("div", "error-box", message);
  box.setAttribute("role", "alert");
  container.append(box);
  container.hidden = false;
}

function renderBias(result: AnalysisResult): HTMLElement {
  const section = el("section", "card");
  const head = el("div", "bias-head");

  append(
    head,
    el("span", `badge badge--${result.bias.label}`, LABELS[result.bias.label]),
    el(
      "span",
      "confidence",
      `Zekerheid ${Math.round(clampConfidence(result.bias.confidence) * 100)}%`,
    ),
  );
  section.append(head);

  if (result.bias.explanation) {
    section.append(el("p", undefined, result.bias.explanation));
  }

  if (result.bias.label === "not_political") {
    section.append(
      el(
        "p",
        "muted",
        "Deze tekst lijkt niet over politiek te gaan. Er worden daarom geen claims en factchecks getoond.",
      ),
    );
  } else if (result.bias.evidence.length > 0) {
    const evidenceHeading = el("p", "evidence-heading", "Citaten uit de tekst");
    section.append(evidenceHeading);

    for (const evidence of result.bias.evidence) {
      section.append(
        el("blockquote", undefined, evidence.quote),
        el("p", "evidence-reason", evidence.reason),
      );
    }
  }

  const scale = el("p", "scale-note");
  scale.append(
    "Links/rechts volgens de Amerikaanse politieke schaal.",
  );
  if (result.bias.scale_note) {
    scale.append(document.createElement("br"), result.bias.scale_note);
  }
  section.append(scale);

  return section;
}

function renderFactcheck(factcheck: Factcheck): HTMLElement {
  const box = el("div", "factcheck");

  const meta = el("p", "factcheck-meta");
  append(
    meta,
    el("strong", undefined, factcheck.publisher || "Onbekende factchecker"),
    " beoordeelde dit als ",
    el("span", "factcheck-rating", `“${factcheck.rating_text}”`),
    el(
      "small",
      undefined,
      ` (${factcheck.source_type === "news_media" ? "nieuwsmedia" : "factchecker"})`,
    ),
  );
  box.append(meta);

  if (factcheck.title) {
    const title = el("p", "factcheck-title");
    title.append(linkNode(factcheck.title, factcheck.url));
    box.append(title);
  }

  const details: string[] = [];
  if (factcheck.publisher_site) {
    details.push(factcheck.publisher_site);
  }
  if (factcheck.review_date) {
    details.push(factcheck.review_date);
  }
  if (details.length > 0) {
    box.append(el("small", undefined, details.join(" · ")));
  }

  return box;
}

function renderClaim(claim: Claim): HTMLElement {
  const box = el("div", "claim");
  box.append(el("p", "claim-text", claim.text));

  const factchecks =
    claim.status === "factcheck_found" ? claim.factchecks : [];

  if (factchecks.length === 0) {
    box.append(
      el(
        "p",
        "no-factcheck",
        "Geen factcheck gevonden (dit betekent niet dat de claim klopt).",
      ),
    );
  } else {
    for (const factcheck of factchecks) {
      box.append(renderFactcheck(factcheck));
    }
  }

  return box;
}

function renderClaims(result: AnalysisResult): HTMLElement {
  const section = el("section", "card");
  section.append(el("h2", undefined, "Claims"));

  if (result.claims.length === 0) {
    section.append(el("p", "muted", "Geen controleerbare claims gevonden."));
    return section;
  }

  for (const claim of result.claims) {
    section.append(renderClaim(claim));
  }
  return section;
}

function renderSourceRating(rating: SourceRating): HTMLElement {
  const section = el("section", "card rating-block");
  section.append(
    el(
      "h2",
      undefined,
      "Bronrating (apart signaal, niet gebruikt voor de analyse)",
    ),
  );

  const line = el("p");
  append(
    line,
    el("strong", undefined, rating.publisher),
    ` — AllSides: ${rating.rating}`,
  );
  section.append(line);

  const note = el(
    "p",
    "muted",
    `Peildatum ${rating.asOf}. Rating kan wijzigen. Licentie ${rating.license}.`,
  );
  append(note, " ", linkNode("Bekijk op AllSides", rating.sourceUrl));
  section.append(note);

  return section;
}

function renderLimitations(result: AnalysisResult): HTMLElement | undefined {
  if (result.limitations.length === 0) {
    return undefined;
  }
  const section = el("section", "card");
  section.append(el("h2", undefined, "Beperkingen"));
  const list = el("ul", "limitations");
  for (const limitation of result.limitations) {
    list.append(el("li", undefined, limitation));
  }
  section.append(list);
  return section;
}

export function renderResult(
  container: HTMLElement,
  result: AnalysisResult,
  sourceRating?: SourceRating,
): void {
  clearResults(container);

  const fragment = document.createDocumentFragment();
  fragment.append(renderBias(result));

  // not_political: geen claims-sectie, ook niet als de server er toch een
  // terugstuurt.
  if (result.bias.label !== "not_political") {
    fragment.append(renderClaims(result));
  }

  if (sourceRating) {
    fragment.append(renderSourceRating(sourceRating));
  }

  const limitations = renderLimitations(result);
  if (limitations) {
    fragment.append(limitations);
  }

  fragment.append(
    el(
      "div",
      "disclaimer",
      result.disclaimer || FALLBACK_DISCLAIMER,
    ),
  );

  const metaParts = [
    `Model: ${result.meta.model}`,
    `${result.meta.analyzed_words} woorden geanalyseerd`,
  ];
  if (result.meta.truncated) {
    metaParts.push("afgekapt op 3.000 woorden");
  }
  fragment.append(el("p", "meta-line", metaParts.join(" · ")));

  container.append(fragment);
  container.hidden = false;
}
