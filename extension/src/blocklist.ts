/**
 * Gevoelige domeinen waar de extensie niets uitleest en niets naartoe stuurt.
 *
 * Matching gebeurt op hostname en op alle subdomeinen: "mail.google.com" valt
 * onder "google.com" alleen als dat hier expliciet staat. Daarom staan de
 * mail-/bankdiensten hier met hun eigen domein, niet met het moederdomein
 * (anders zou bijv. alle Google-diensten geblokkeerd worden).
 */
const BLOCKED_DOMAINS: readonly string[] = [
  // E-mail
  "mail.google.com",
  "gmail.com",
  "outlook.com",
  "outlook.live.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "mail.yahoo.com",
  "proton.me",
  "protonmail.com",
  "icloud.com",
  "zoho.com",
  "tutanota.com",
  // Bankieren (België / Nederland)
  "ing.be",
  "kbc.be",
  "belfius.be",
  "argenta.be",
  "bnpparibasfortis.be",
  "abnamro.nl",
  "rabobank.nl",
  "ing.nl",
  "bunq.com",
  "revolut.com",
  "n26.com",
  "triodos.be",
  "triodos.nl",
  // Betaalproviders
  "paypal.com",
  "stripe.com",
  "mollie.com",
  "adyen.com",
  "klarna.com",
  "wise.com",
  "payconiq.com",
  // Overheidsportalen met persoonlijke gegevens
  "myminfin.be",
  "mijnpensioen.be",
  "belastingdienst.nl",
  "mijnoverheid.nl",
  "digid.nl",
  "itsme.be",
];

/** Haalt de hostname uit een URL; undefined bij ongeldige of niet-http(s)-URL's. */
export function parseHostname(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }
    return parsed.hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

/** True als de hostname gelijk is aan of een subdomein is van een blocklist-domein. */
export function isBlockedHost(hostname: string | undefined): boolean {
  if (!hostname) {
    return false;
  }
  const host = hostname.toLowerCase();
  return BLOCKED_DOMAINS.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
}
