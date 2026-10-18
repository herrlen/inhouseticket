// Matomo in the browser – the one place that talks to the tracker. Cookieless, Do-Not-Track
// respected; the tracker (/stat.js, vendored) sends to /stat, which forwards server-side
// (src/app/stat/route.ts). Every URL and title goes through src/lib/analytics-url.ts first, so
// no workspace slug, ticket key, token or name ever reaches Matomo.
// Plain module, client-safe (no Zod/DB): the root layout builds the bootstrap snippet with it.
// Without Matomo configured there is no window._paq and every call is a no-op.
import { analyticsReferrer, analyticsTitle, analyticsUrl } from "@/lib/analytics-url";

type Command = [string, ...unknown[]];

declare global {
  interface Window {
    _paq?: Command[];
  }
}

/** Last page view sent (normalised URL + title) – identical successive views are skipped. */
let last: { key: string; url: string } | null = null;

const queue = (): Command[] | null => (typeof window === "undefined" ? null : (window._paq ?? null));

/**
 * Inline bootstrap for the root layout (rendered with the CSP nonce): configures the tracker and
 * loads /stat.js. No page view here – trackPage() sends the first one with the normalised URL.
 */
export function initMatomo(siteId: string): string {
  return (
    "var _paq=window._paq=window._paq||[];" +
    "_paq.push(['disableCookies']);_paq.push(['setDoNotTrack',true]);" +
    `_paq.push(['setTrackerUrl','/stat']);_paq.push(['setSiteId',${JSON.stringify(siteId)}]);` +
    "var g=document.createElement('script');g.async=true;g.src='/stat.js';document.head.appendChild(g);"
  );
}

/** Sets URL and referrer for all following requests (page views and events). */
function setUrl(q: Command[], url: string, referrer: string) {
  q.push(["setReferrerUrl", referrer]);
  q.push(["setCustomUrl", url]);
}

/** One page view for the current location – call on every route change; duplicates are dropped. */
export function trackPage(pathname = window.location.pathname, search = window.location.search): void {
  const q = queue();
  if (!q) return;
  const { origin, hostname } = window.location;
  const url = origin + analyticsUrl(pathname, search);
  const title = analyticsTitle(pathname, search);
  const key = `${url}\n${title}`;
  if (last?.key === key) return;
  setUrl(q, url, last ? last.url : analyticsReferrer(document.referrer, origin));
  q.push(["setDocumentTitle", `${hostname}/${title}`]);
  q.push(["trackPageView"]);
  last = { key, url };
}

/**
 * A Matomo event. Only fixed labels – never names, addresses, ticket content or ids.
 * Before the first page view the (normalised) URL is set, so an event never carries the raw one.
 */
export function trackEvent(category: string, action: string, name?: string, value?: number): void {
  const q = queue();
  if (!q) return;
  if (!last) {
    const { origin, pathname, search } = window.location;
    setUrl(q, origin + analyticsUrl(pathname, search), analyticsReferrer(document.referrer, origin));
  }
  const cmd: Command = ["trackEvent", category, action];
  if (name !== undefined || value !== undefined) cmd.push(name ?? "");
  if (value !== undefined) cmd.push(value);
  q.push(cmd);
}
