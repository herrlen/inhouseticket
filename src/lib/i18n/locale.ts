// Locale basics shared by server and client (no Next.js or React imports).
export const LOCALES = ["de", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "de";
/** Cookie holding the chosen UI language; set only by the language toggle (no Accept-Language redirects). */
export const LOCALE_COOKIE = "lang";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** BCP 47 tag for Intl formatters. English uses en-GB: day before month, 24-hour clock – as in Germany. */
export function intlLocale(locale: Locale): string {
  return locale === "en" ? "en-GB" : "de-DE";
}
