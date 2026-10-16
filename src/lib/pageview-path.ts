// Turns a request path into a pattern that carries no customer data (workspace slugs, ticket keys,
// invitation tokens). Pure, so it is unit-tested.

const PUBLIC = new Set(["/", "/login", "/impressum", "/datenschutz", "/agb", "/avv", "/umziehen", "/start", "/onboarding", "/oauth/consent", "/admin", "/set-password", "/forgot-password", "/reset-password"]);
const APP_PAGES = new Set(["me", "inbox", "dashboard"]);
const SETTINGS = new Set(["members", "claude", "data", "account"]);

export function normalizePath(pathname: string): string {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (PUBLIC.has(path)) return path;
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "invite") return "/invite/[token]";
  if (parts.length === 0) return "/";
  const [, second, third, fourth] = parts;
  const ws = "/[workspace]";
  if (parts.length === 1) return ws;
  if (second && APP_PAGES.has(second) && parts.length === 2) return `${ws}/${second}`;
  if (second === "settings" && third && SETTINGS.has(third) && parts.length === 3) return `${ws}/settings/${third}`;
  if (second === "p" && third) {
    if (parts.length === 3) return `${ws}/p/[key]`;
    if (fourth === "settings" && parts.length === 4) return `${ws}/p/[key]/settings`;
  }
  return `${ws}/…`;
}

/** External referring host, "" for none or our own site. */
export function referrerHost(referer: string | null, ownHost: string): string {
  if (!referer) return "";
  try {
    const host = new URL(referer).hostname.toLowerCase().replace(/^www\./, "");
    return host === ownHost.replace(/^www\./, "") ? "" : host.slice(0, 253);
  } catch {
    return "";
  }
}

const BOT = /bot|crawl|spider|slurp|preview|monitor|curl|wget|python|httpclient|headless|lighthouse|facebookexternalhit|embedly/i;

export function isBot(userAgent: string | null): boolean {
  return !userAgent || BOT.test(userAgent);
}
