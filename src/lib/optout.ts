// Measurement opt-out ("Messung auf diesem Gerät deaktivieren", privacy policy section 5). One
// first-party cookie, readable by the tracker in the browser (it holds no identifier, only "1").
// Set: no Matomo snippet, no tracker calls, /stat forwards nothing, no server events and no entry
// in the own page-view count. Do Not Track and Global Privacy Control count the same for Matomo.
// Plain module, client-safe (no Zod/DB/env).

export const OPTOUT_COOKIE = "iht_optout";
/** One year, like the language cookie. */
export const OPTOUT_MAX_AGE = 60 * 60 * 24 * 365;

const OPTOUT_PATTERN = new RegExp(`(?:^|;\\s*)${OPTOUT_COOKIE}=1(?:;|$)`);

/** True when a Cookie header (or document.cookie) carries the opt-out. */
export function hasOptOutCookie(cookieHeader: string | null | undefined): boolean {
  return typeof cookieHeader === "string" && OPTOUT_PATTERN.test(cookieHeader);
}

/** Request side: Do Not Track, Global Privacy Control (Sec-GPC) or the opt-out cookie – measure nothing. */
export function measurementRefused(headers: Headers): boolean {
  return headers.get("dnt") === "1" || headers.get("sec-gpc") === "1" || hasOptOutCookie(headers.get("cookie"));
}

/** Browser side: opt-out set on this device (also right after the toggle, before any reload). */
export function optedOutInBrowser(): boolean {
  return typeof document !== "undefined" && hasOptOutCookie(document.cookie);
}

/**
 * Browser check for the inline bootstrap, as a JS expression: GPC, Do Not Track or the opt-out
 * cookie. When true the tracker is never configured or loaded (window._paq stays undefined).
 */
export const BROWSER_REFUSES_JS =
  "n.globalPrivacyControl===true||n.doNotTrack==='1'||window.doNotTrack==='1'||" +
  `/(?:^|;\\s*)${OPTOUT_COOKIE}=1(?:;|$)/.test(document.cookie)`;
