import { MAX_OAUTH_CLIENT_NAME } from "@/lib/limits";

// Dynamic client registration is open (MCP needs it), so a client's name is whatever the
// registrant typed – "Claude" included. What cannot be faked is where the authorization code goes:
// the redirect URI. The consent page shows its host and warns about hosts we don't know (ADR 004).

/** Redirect hosts of Anthropic's own connectors (claude.ai web, claude.com). Exact match, https only. */
export const KNOWN_REDIRECT_HOSTS: readonly string[] = ["claude.ai", "claude.com"];

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export type RedirectTrust = {
  /** What the person sees: host (with port for loopback), or scheme for app links. */
  host: string;
  /** known: Anthropic host · loopback: a program on this device · unknown: anything else. */
  kind: "known" | "loopback" | "unknown";
};

/** Classifies a redirect URI; null if it is no valid absolute URL. */
export function redirectTrust(uri: string | null | undefined): RedirectTrust | null {
  if (!uri) return null;
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return null;
  }
  if (url.protocol === "https:" || url.protocol === "http:") {
    if (!url.hostname) return null;
    if (LOOPBACK_HOSTS.has(url.hostname)) return { host: url.host, kind: "loopback" };
    if (url.protocol === "https:" && !url.port && KNOWN_REDIRECT_HOSTS.includes(url.hostname)) return { host: url.hostname, kind: "known" };
    return { host: url.host, kind: "unknown" };
  }
  // App links (cursor://, vscode://…): any app can claim a scheme, so never "known".
  return { host: url.host ? `${url.protocol}//${url.host}` : url.protocol, kind: "unknown" };
}

/**
 * Redirect URI of an authorization request, only if it is one the client registered (the provider
 * checks the same; this keeps the page honest should that ever change). Falls back to the single
 * registered URI when the request names none.
 */
export function consentRedirectUri(requested: string | null, registered: readonly string[]): string | null {
  if (requested) return registered.includes(requested) ? requested : null;
  return registered.length === 1 ? (registered[0] ?? null) : null;
}

/** Client name for storage and display: no control characters, single spaces, at most MAX_OAUTH_CLIENT_NAME. */
export function sanitizeClientName(name: unknown): string | undefined {
  if (typeof name !== "string") return undefined;
  const clean = name.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  const chars = Array.from(clean);
  return chars.length > MAX_OAUTH_CLIENT_NAME ? `${chars.slice(0, MAX_OAUTH_CLIENT_NAME - 1).join("").trimEnd()}…` : clean;
}
