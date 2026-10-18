// Which responses search engines may index. Pure – shared by src/proxy.ts, the analytics URL
// normalisation (src/lib/analytics-url.ts) and tests.

/** Public marketing and legal pages: indexable (once SITE_INDEXABLE=true), listed in the sitemap. */
export const PUBLIC_PAGES: ReadonlySet<string> = new Set(["/", "/umziehen", "/impressum", "/datenschutz", "/agb", "/avv"]);

/** Value of the X-Robots-Tag header on everything that is not a public page. */
export const NOINDEX = "noindex, nofollow";

/** Meta robots for the same pages (auth, workspace and admin layouts) – belt and braces with the header. */
export const NOINDEX_ROBOTS = { index: false, follow: false } as const;

const STATIC_FILE = /\.[a-z0-9]{2,5}$/i;

/**
 * True for responses that must carry `X-Robots-Tag: noindex, nofollow`: workspaces, auth pages,
 * /admin, OAuth metadata – everything but the public pages and static files (images, robots.txt,
 * sitemap.xml, the Open Graph image). API and MCP get the header from next.config.ts.
 */
export function needsNoindex(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (PUBLIC_PAGES.has(path)) return false;
  if (path.startsWith("/_next/") || path.startsWith("/opengraph-image")) return false;
  return !STATIC_FILE.test(path);
}
