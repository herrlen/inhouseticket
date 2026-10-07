import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

// Closed beta: everything stays out of search engines until SITE_INDEXABLE=true (launch).
// Afterwards only the public pages; workspaces need a login anyway.
export default function robots(): MetadataRoute.Robots {
  if (!env.SITE_INDEXABLE) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/oauth/", "/invite/", "/start", "/onboarding", "/mcp"] }],
    sitemap: new URL("/sitemap.xml", env.APP_URL).toString(),
  };
}
