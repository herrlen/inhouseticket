import "server-only";
import { env } from "@/lib/env";
import { anonymizeIp, trackingParams } from "@/lib/matomo-params";

// Self-hosted Matomo (analytics.klatxt.de, same operator, mittwald) behind our own domain: the
// browser only talks to /stat and /stat.js, we forward server-side. Cookieless; the IP is truncated
// here before it reaches Matomo, so the privacy promise does not depend on a Matomo setting.
// Without MATOMO_URL, MATOMO_SITE_ID and MATOMO_TOKEN everything stays off (no snippet, routes 404).

const TIMEOUT_MS = 4_000;
const JS_TTL_MS = 24 * 60 * 60 * 1000;

let cachedJs: { body: string; at: number } | undefined;

export function matomoEnabled(): boolean {
  return Boolean(env.MATOMO_URL && env.MATOMO_SITE_ID && env.MATOMO_TOKEN);
}

export function matomoSiteId(): string {
  return env.MATOMO_SITE_ID ?? "";
}

/** The tracker script, fetched once a day; a stale copy beats no copy when Matomo is down. */
export async function matomoJs(): Promise<string | undefined> {
  if (!matomoEnabled()) return undefined;
  if (cachedJs && Date.now() - cachedJs.at < JS_TTL_MS) return cachedJs.body;
  try {
    const res = await fetch(`${env.MATOMO_URL}/matomo.js`, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    cachedJs = { body: await res.text(), at: Date.now() };
  } catch (e) {
    console.error("matomo: matomo.js unavailable", e instanceof Error ? e.message : e);
  }
  return cachedJs?.body;
}

/** Forwards one tracking request. Never throws – a lost page view must not break anything. */
export async function forwardHit(params: URLSearchParams, ip: string, userAgent: string, language: string) {
  if (!matomoEnabled()) return;
  const data = trackingParams(params);
  if (data.size === 0) return;
  data.set("idsite", matomoSiteId());
  data.set("rec", "1");
  const cip = anonymizeIp(ip);
  if (cip) data.set("cip", cip);
  data.set("token_auth", env.MATOMO_TOKEN ?? "");
  try {
    await fetch(`${env.MATOMO_URL}/matomo.php`, {
      method: "POST",
      body: data,
      headers: { "User-Agent": userAgent || "inhouseticket-proxy", "Accept-Language": language },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    console.error("matomo: hit not delivered", e instanceof Error ? e.message : e);
  }
}
