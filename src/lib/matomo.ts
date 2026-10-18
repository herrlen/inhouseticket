import "server-only";
import { headers } from "next/headers";
import { after } from "next/server";
import { analyticsPath } from "@/lib/analytics-url";
import { env } from "@/lib/env";
import { anonymizeIp, trackingParams } from "@/lib/matomo-params";
import { measurementRefused } from "@/lib/optout";
import { clientIp } from "@/lib/registration";

// Self-hosted Matomo (analytics.klatxt.de, same operator, mittwald) behind our own domain: the
// browser only talks to /stat and /stat.js, we forward server-side. /stat.js is the tracker,
// vendored and pinned in public/stat.js (official Matomo release, see docs/betrieb.md) – no code is
// loaded from the Matomo server at runtime. Cookieless; the IP is truncated
// here before it reaches Matomo, so the privacy promise does not depend on a Matomo setting.
// Without MATOMO_URL, MATOMO_SITE_ID and MATOMO_TOKEN everything stays off (no snippet, /stat answers 404; the static /stat.js is unused).

const TIMEOUT_MS = 4_000;

export function matomoEnabled(): boolean {
  return Boolean(env.MATOMO_URL && env.MATOMO_SITE_ID && env.MATOMO_TOKEN);
}

export function matomoSiteId(): string {
  return env.MATOMO_SITE_ID ?? "";
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

/**
 * A Matomo event from a Server Action that ends in a redirect (the browser never gets to report it).
 * Same path as /stat: allowlisted parameters, truncated IP; nothing with Do Not Track, Global
 * Privacy Control or the opt-out cookie (src/lib/optout.ts). `path` is the
 * page the action belongs to and is normalised like every other URL. Only fixed labels – never
 * names, addresses or content. Sent after the response; never throws.
 */
export async function trackServerEvent(event: { category: string; action: string; name?: string; value?: number; path: string }) {
  if (!matomoEnabled()) return;
  const h = await headers();
  if (measurementRefused(h)) return;
  const params = new URLSearchParams({
    e_c: event.category,
    e_a: event.action,
    url: new URL(analyticsPath(event.path), env.APP_URL).toString(),
    apiv: "1",
    rand: Math.random().toString(36).slice(2, 10),
    send_image: "0",
  });
  if (event.name) params.set("e_n", event.name);
  if (event.value !== undefined) params.set("e_v", String(event.value));
  const ip = clientIp(h);
  const ua = h.get("user-agent") ?? "";
  const lang = h.get("accept-language") ?? "";
  after(() => forwardHit(params, ip, ua, lang));
}
