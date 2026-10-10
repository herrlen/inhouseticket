import { headers } from "next/headers";
import { matomoEnabled, matomoSiteId } from "@/lib/matomo";

/**
 * Matomo page view for public pages (landing, legal, login) – never inside workspaces.
 * Cookieless; the tracker loads from /stat.js, allowed by the CSP via the nonce and 'strict-dynamic'.
 */
export async function MatomoTracker() {
  if (!matomoEnabled()) return null;
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const code =
    "var _paq=window._paq=window._paq||[];" +
    "_paq.push(['disableCookies']);_paq.push(['setDoNotTrack',true]);" +
    "_paq.push(['trackPageView']);_paq.push(['enableLinkTracking']);" +
    `_paq.push(['setTrackerUrl','/stat']);_paq.push(['setSiteId',${JSON.stringify(matomoSiteId())}]);` +
    "var g=document.createElement('script');g.async=true;g.src='/stat.js';document.head.appendChild(g);";
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: code }} />;
}
