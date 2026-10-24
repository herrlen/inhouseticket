import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy } from "@/lib/csp";
import { hostname, siteHost, siteRedirect } from "@/lib/hosts";
import { NOINDEX, needsNoindex } from "@/lib/indexing";
import { isBot, normalizePath, referrerHost } from "@/lib/pageview-path";
import { hasOptOutCookie } from "@/lib/optout";
import { recordPageView } from "@/lib/pageviews";
import { HOSTS } from "@/lib/site";

/** Both hosts are ours: a visit from the landing page to the app is no outside referral. */
const OWN_HOSTS = new Set([new URL(HOSTS.appUrl).hostname, siteHost(HOSTS)].filter(Boolean));

/** Sets a fresh CSP nonce per page request; Next.js picks it up from the request header. */
export function proxy(request: NextRequest) {
  // inhouseticket.com keeps landing and legal pages; sign-in, workspaces and /api/auth move to
  // app.inhouseticket.com (src/lib/hosts.ts). The Host header, not nextUrl: that is the
  // container's own address behind the mittwald proxy.
  const host = request.headers.get("host");
  const moved = siteRedirect({ host, pathname: request.nextUrl.pathname, search: request.nextUrl.search, method: request.method }, HOSTS);
  if (moved) return NextResponse.redirect(moved.url, moved.status);
  // /api/auth only runs through here for that redirect: no CSP, no page view.
  if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();

  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce, process.env.NODE_ENV === "development");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  // Cookieless statistics: full page loads only (no client navigations, prefetches or bots), never
  // with the measurement opt-out (privacy policy section 5).
  if (
    request.method === "GET" &&
    request.headers.get("sec-fetch-dest") === "document" &&
    !isBot(request.headers.get("user-agent")) &&
    !hasOptOutCookie(request.headers.get("cookie"))
  ) {
    const referrer = referrerHost(request.headers.get("referer"), hostname(host));
    recordPageView(normalizePath(request.nextUrl.pathname), OWN_HOSTS.has(referrer) ? "" : referrer);
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  // App, sign-in, /admin, OAuth metadata: never in search results. Not via robots.txt – crawlers
  // must be allowed to fetch the page to see this header.
  if (needsNoindex(request.nextUrl.pathname)) response.headers.set("X-Robots-Tag", NOINDEX);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: API, MCP, the tracking endpoint and static files carry no inline scripts (and
      // skip the proxy's body buffering). "stat" only as the whole path, so /statistik-gmbh stays covered.
      source: "/((?!api|mcp|stat$|stat\\.js$|_next/static|_next/image|favicon.ico|robots.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
    // Only for the site → app redirect of sign-in links (src/lib/hosts.ts); auth bodies are small.
    { source: "/api/auth/:path*" },
  ],
};
