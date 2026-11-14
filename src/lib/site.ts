import "server-only";
import { env } from "@/lib/env";
import { hostname, sharedCookieDomain, siteHost, trustedOrigins, type Hosts } from "@/lib/hosts";
import { legalLinks, type Instance } from "@/lib/instance";

// The two public addresses, derived once from APP_URL and SITE_URL (src/lib/hosts.ts).

export const HOSTS: Hosts = { appUrl: env.APP_URL, siteUrl: env.SITE_URL };

/** Base of the marketing and legal pages: canonicals, sitemap, robots. Falls back to APP_URL. */
export const SITE_URL = siteHost(HOSTS) && env.SITE_URL ? env.SITE_URL : env.APP_URL;

/** Domain attribute for cookies both hosts need (session, language, measurement opt-out). */
export const COOKIE_DOMAIN = sharedCookieDomain(HOSTS);

export const TRUSTED_ORIGINS = trustedOrigins(HOSTS);

/**
 * Link target on the app host for pages the site host also serves (landing, /umziehen): absolute
 * when a separate site host exists – saves the 301 hop – otherwise the plain path.
 */
export function appHref(path: string): string {
  return siteHost(HOSTS) ? new URL(path, env.APP_URL).toString() : path;
}

/** True when the request came in on the site host (inhouseticket.com, not app.…). */
export function isSiteHost(hostHeader: string | null): boolean {
  const site = siteHost(HOSTS);
  return site !== null && hostname(hostHeader) === site;
}

/** True on the app host while a separate site host exists – there "/" is the sign-in, not the landing page. */
export function isAppHost(hostHeader: string | null): boolean {
  return siteHost(HOSTS) !== null && !isSiteHost(hostHeader);
}

/** Company instance settings (SELF_HOSTED, src/lib/instance.ts). */
export const INSTANCE: Instance = {
  selfHosted: env.SELF_HOSTED,
  name: env.INSTANCE_NAME,
  imprintUrl: env.IMPRINT_URL,
  privacyUrl: env.PRIVACY_URL,
};

/** Legal links for footers, menus and forms on this deployment. */
export const LEGAL_LINKS = legalLinks(INSTANCE);
