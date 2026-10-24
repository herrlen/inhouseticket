// Two hosts, one container: the app lives on APP_URL (app.inhouseticket.com), the marketing and
// legal pages also on SITE_URL (inhouseticket.com). Pure – shared by src/proxy.ts, src/lib/site.ts
// and tests.

/** Paths the site host serves itself; everything else there is a redirect to the app host. */
const SITE_PATHS: ReadonlySet<string> = new Set([
  "/",
  "/umziehen",
  "/impressum",
  "/datenschutz",
  "/agb",
  "/avv",
  "/robots.txt",
  "/sitemap.xml",
  "/favicon.ico",
  "/icon.svg",
  "/apple-icon.png",
  "/stat",
  "/stat.js",
]);

/** Prefixes the site host serves itself: landing screenshots, Open Graph image, OAuth discovery. */
const SITE_PREFIXES = ["/landing/", "/opengraph-image", "/.well-known/"];

export type Hosts = { appUrl: string; siteUrl: string | undefined };

/** Host part (lower case, without port) of a Host header. */
export function hostname(hostHeader: string | null): string {
  return (hostHeader ?? "").toLowerCase().replace(/:\d+$/, "");
}

/** The site host when it differs from the app host, otherwise null (one host, no redirects). */
export function siteHost({ appUrl, siteUrl }: Hosts): string | null {
  if (!siteUrl) return null;
  const site = new URL(siteUrl).hostname;
  return site === new URL(appUrl).hostname ? null : site;
}

/**
 * Cookie domain shared by both hosts: the site host when the app host is a subdomain of it
 * (app.inhouseticket.com under inhouseticket.com). Otherwise undefined – cookies stay host-only.
 */
export function sharedCookieDomain(hosts: Hosts): string | undefined {
  const site = siteHost(hosts);
  if (!site) return undefined;
  return new URL(hosts.appUrl).hostname.endsWith(`.${site}`) ? site : undefined;
}

/** Origins allowed to send cookie-authenticated mutations: the app, and the site when set. */
export function trustedOrigins(hosts: Hosts): string[] {
  const origins = [new URL(hosts.appUrl).origin];
  if (siteHost(hosts) && hosts.siteUrl) origins.push(new URL(hosts.siteUrl).origin);
  return origins;
}

/**
 * Where a request on the site host belongs: the same path on the app host (301 for GET/HEAD,
 * 308 otherwise, so a POST stays a POST) or null when the site host answers itself. API and MCP
 * calls other than GET/HEAD stay where they are – connectors set up with the old address keep
 * refreshing tokens and calling /mcp there.
 */
export function siteRedirect(
  req: { host: string | null; pathname: string; search: string; method: string },
  hosts: Hosts,
): { url: string; status: 301 | 308 } | null {
  const site = siteHost(hosts);
  if (!site || hostname(req.host) !== site) return null;
  const path = req.pathname.replace(/\/+$/, "") || "/";
  if (SITE_PATHS.has(path) || SITE_PREFIXES.some((p) => req.pathname.startsWith(p))) return null;
  const read = req.method === "GET" || req.method === "HEAD";
  const api = path === "/mcp" || path.startsWith("/mcp/") || path.startsWith("/api/");
  if (api && (!read || !path.startsWith("/api/auth/"))) return null;
  return { url: new URL(`${req.pathname}${req.search}`, hosts.appUrl).toString(), status: read ? 301 : 308 };
}
