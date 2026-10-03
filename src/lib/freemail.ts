// Freemail providers that cannot be used to register (CLAUDE.md, rule 3).
// Extend freely; matching also covers subdomains (e.g. "mail.gmx.de").
export const FREEMAIL_DOMAINS: ReadonlySet<string> = new Set([
  // International
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "outlook.de",
  "hotmail.com",
  "hotmail.de",
  "live.com",
  "live.de",
  "msn.com",
  "yahoo.com",
  "yahoo.de",
  "ymail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "aol.de",
  "proton.me",
  "protonmail.com",
  "protonmail.ch",
  "pm.me",
  "tutanota.com",
  "tutanota.de",
  "tuta.io",
  "tuta.com",
  "zoho.com",
  "yandex.com",
  "yandex.ru",
  "mail.ru",
  "gmx.com",
  "gmx.net",
  "mail.com",
  "fastmail.com",
  "hey.com",
  // Germany / DACH
  "gmx.de",
  "gmx.at",
  "gmx.ch",
  "web.de",
  "t-online.de",
  "freenet.de",
  "mail.de",
  "posteo.de",
  "posteo.net",
  "mailbox.org",
  "arcor.de",
  "online.de",
  "email.de",
  "vodafone.de",
  "bluewin.ch",
  "a1.net",
  // Disposable
  "mailinator.com",
  "guerrillamail.com",
  "10minutemail.com",
  "temp-mail.org",
  "trashmail.com",
  "yopmail.com",
  "wegwerfmail.de",
]);

const EMAIL_PATTERN = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/;

/** Returns the normalized (lowercase, no trailing dot) domain or null if the address is malformed. */
export function getEmailDomain(email: string): string | null {
  const match = EMAIL_PATTERN.exec(email.trim().toLowerCase());
  const domain = match?.[1]?.replace(/\.$/, "");
  if (!domain || domain.startsWith(".") || domain.includes("..")) return null;
  return domain;
}

export function isFreemailDomain(domain: string): boolean {
  const labels = domain.toLowerCase().split(".");
  // Check the domain itself and every parent domain ("a.gmx.de" → "gmx.de").
  for (let i = 0; i < labels.length - 1; i++) {
    if (FREEMAIL_DOMAINS.has(labels.slice(i).join("."))) return true;
  }
  return false;
}

/** True if the address is well-formed and does not belong to a freemail provider. */
export function isCompanyEmail(email: string): boolean {
  const domain = getEmailDomain(email);
  return domain !== null && !isFreemailDomain(domain);
}
