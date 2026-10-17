import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy } from "@/lib/csp";
import { isBot, normalizePath, referrerHost } from "@/lib/pageview-path";
import { recordPageView } from "@/lib/pageviews";

/** Sets a fresh CSP nonce per page request; Next.js picks it up from the request header. */
export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce, process.env.NODE_ENV === "development");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  // Cookieless statistics: full page loads only (no client navigations, prefetches or bots).
  if (request.method === "GET" && request.headers.get("sec-fetch-dest") === "document" && !isBot(request.headers.get("user-agent"))) {
    recordPageView(normalizePath(request.nextUrl.pathname), referrerHost(request.headers.get("referer"), request.nextUrl.hostname));
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
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
  ],
};
