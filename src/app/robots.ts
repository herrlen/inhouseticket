import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

// Closed beta: everything stays out of search engines until SITE_INDEXABLE=true (launch).
// Afterwards nothing is disallowed: app, sign-in, API and MCP answer with X-Robots-Tag: noindex
// (src/proxy.ts, next.config.ts), which a crawler only sees if it may fetch the URL.
export default function robots(): MetadataRoute.Robots {
  if (!env.SITE_INDEXABLE) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: new URL("/sitemap.xml", env.APP_URL).toString(),
  };
}
