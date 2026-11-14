// Company instance (SELF_HOSTED=true, selfhost/ and docs/selbst-hosten.md): one host, no landing
// page, no search engines, legal pages of the operating company instead of ours. Pure – shared by
// src/lib/env.ts, the legal pages, the shell and tests.

export type Instance = {
  selfHosted: boolean;
  /** Display name of the operating company, e.g. "Firma GmbH" (INSTANCE_NAME). */
  name?: string;
  /** The company's own legal notice (IMPRINT_URL). */
  imprintUrl?: string;
  /** The company's own privacy policy (PRIVACY_URL). */
  privacyUrl?: string;
};

export type LegalKey = "imprint" | "privacy" | "terms" | "dpa";
export type LegalLink = { key: LegalKey; href: string; external: boolean };

export const LEGAL_PATHS: Readonly<Record<LegalKey, string>> = {
  imprint: "/impressum",
  privacy: "/datenschutz",
  terms: "/agb",
  dpa: "/avv",
};

/**
 * Settings a company instance must not inherit from the hosted service: no separate marketing
 * host (one address, no redirects) and never indexable – whatever the .env says.
 */
export function applyInstance<T extends { SELF_HOSTED: boolean; SITE_URL?: string; SITE_INDEXABLE: boolean }>(env: T): T {
  return env.SELF_HOSTED ? { ...env, SITE_URL: undefined, SITE_INDEXABLE: false } : env;
}

/**
 * Legal links in footers, menus and forms. Hosted: our four pages. Company instance: legal notice
 * and privacy policy only (terms and the DPA belong to the hosted service), pointing straight at
 * the company's pages when configured.
 */
export function legalLinks(instance: Instance): LegalLink[] {
  if (!instance.selfHosted) {
    return (Object.keys(LEGAL_PATHS) as LegalKey[]).map((key) => ({ key, href: LEGAL_PATHS[key], external: false }));
  }
  const own = (key: LegalKey, url: string | undefined): LegalLink => (url ? { key, href: url, external: true } : { key, href: LEGAL_PATHS[key], external: false });
  return [own("imprint", instance.imprintUrl), own("privacy", instance.privacyUrl)];
}

/**
 * What a legal page shows: our own text (hosted), a redirect to the company's page, a neutral
 * note that the company runs this instance (no URL configured), or nothing (terms and DPA).
 */
export function legalPage(key: LegalKey, instance: Instance): { kind: "own" } | { kind: "redirect"; url: string } | { kind: "note" } | { kind: "none" } {
  if (!instance.selfHosted) return { kind: "own" };
  if (key === "terms" || key === "dpa") return { kind: "none" };
  const url = key === "imprint" ? instance.imprintUrl : instance.privacyUrl;
  return url ? { kind: "redirect", url } : { kind: "note" };
}
