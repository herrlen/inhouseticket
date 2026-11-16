// What Matomo gets to see of a URL: a route pattern without customer data and a generic title.
// Workspace slugs, project keys, ticket keys, tokens and ids all become ":id"; the query string
// keeps only `view=board` (project pages) and UTM parameters (public pages). Pure, client-safe
// and unit-tested – used by src/lib/analytics.ts in the browser.
import { PUBLIC_PAGES } from "@/lib/indexing";

export const ID = ":id";

/** First path segments that are routes of their own (everything else is a workspace slug). */
const TOP_LEVEL = new Set([
  "umziehen", "impressum", "datenschutz", "agb", "avv",
  "login", "register", "forgot-password", "reset-password", "set-password", "start", "onboarding", "invite", "oauth", "admin", "dev",
]);
/** Fixed route segments below the first one. Anything else (keys, tokens, ids) becomes ":id". */
const KNOWN = new Set(["me", "inbox", "dashboard", "p", "settings", "members", "claude", "data", "import", "integrations", "clickup", "account", "link", "confirm", "consent", "ui"]);
/** After these segments always an identifier, whatever it looks like. */
const BEFORE_ID = new Set(["p", "invite"]);
const MAX_SEGMENTS = 6;

/** "/acme/p/MKT" → "/:id/p/:id", "/invite/abc" → "/invite/:id", "/login/" → "/login". */
export function analyticsPath(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean).slice(0, MAX_SEGMENTS);
  if (parts.length === 0) return "/";
  const out = parts.map((seg, i) => {
    if (i > 0 && BEFORE_ID.has(parts[i - 1]!)) return ID;
    if (i === 0) return TOP_LEVEL.has(seg) ? seg : ID;
    return KNOWN.has(seg) ? seg : ID;
  });
  return `/${out.join("/")}`;
}

const PROJECT = `/${ID}/p/${ID}`;
const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
/** Campaign values are short labels; anything else (addresses, tokens, long strings) is dropped. */
const UTM_VALUE = /^[A-Za-z0-9._\- ]{1,100}$/;

/** Normalised path plus the few query parameters worth keeping. */
export function analyticsUrl(pathname: string, search: string): string {
  const path = analyticsPath(pathname);
  const input = new URLSearchParams(search);
  const out = new URLSearchParams();
  if (path === PROJECT && input.get("view") === "board") out.set("view", "board");
  if (PUBLIC_PAGES.has(path)) {
    for (const key of UTM) {
      const v = input.get(key);
      if (v && UTM_VALUE.test(v)) out.set(key, v);
    }
  }
  const query = out.toString();
  return query ? `${path}?${query}` : path;
}

const TITLES: Record<string, string> = {
  "/": "Startseite",
  "/umziehen": "Umziehen",
  "/impressum": "Impressum",
  "/datenschutz": "Datenschutz",
  "/agb": "AGB",
  "/avv": "AVV",
  "/login": "Login",
  "/login/link": "Login/Link bestätigen",
  "/register": "Registrierung",
  "/register/confirm": "Registrierung/Bestätigung",
  "/forgot-password": "Passwort vergessen",
  "/reset-password": "Passwort zurücksetzen",
  "/set-password": "Passwort setzen",
  "/start": "Start",
  "/onboarding": "Onboarding",
  [`/invite/${ID}`]: "Einladung",
  "/oauth/consent": "OAuth-Zustimmung",
  "/admin": "Admin",
  [`/${ID}`]: "Übersicht",
  [`/${ID}/me`]: "Meine Tickets",
  [`/${ID}/inbox`]: "Inbox",
  [`/${ID}/dashboard`]: "Dashboard",
  [`${PROJECT}/settings`]: "Projekt/Einstellungen",
  [`/${ID}/settings/members`]: "Einstellungen/Mitglieder",
  [`/${ID}/settings/claude`]: "Einstellungen/Claude",
  [`/${ID}/settings/data`]: "Einstellungen/Daten",
  [`/${ID}/settings/data/import`]: "Einstellungen/Import",
  [`/${ID}/settings/integrations`]: "Einstellungen/Integrationen",
  [`/${ID}/settings/integrations/clickup`]: "Einstellungen/Integrationen/ClickUp",
  [`/${ID}/settings/account`]: "Einstellungen/Konto",
  [`/${ID}/settings/appearance`]: "Einstellungen/Darstellung",
};

/** Generic page title – never a ticket title, project or workspace name. */
export function analyticsTitle(pathname: string, search: string): string {
  const path = analyticsPath(pathname);
  if (path === PROJECT) {
    const params = new URLSearchParams(search);
    if (params.get("t")) return "Ticket Detail";
    return params.get("view") === "board" ? "Board" : "Liste";
  }
  return TITLES[path] ?? "Sonstige";
}

/**
 * Referrer for the first page view: our own pages normalised like any URL, other sites reduced to
 * their origin (a foreign URL may carry anything in its path or query).
 */
export function analyticsReferrer(referrer: string, origin: string): string {
  if (!referrer) return "";
  try {
    const url = new URL(referrer);
    if (url.origin === origin) return origin + analyticsUrl(url.pathname, url.search);
    return url.protocol === "https:" || url.protocol === "http:" ? `${url.origin}/` : "";
  } catch {
    return "";
  }
}
