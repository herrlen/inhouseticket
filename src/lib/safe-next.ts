// Redirect targets after sign-in (`next`). Pure: used by pages, actions and the auth plugins.

// Fixed base for resolving `next`: only the resolved origin matters, and a relative path that
// stays on this origin is the only thing we accept. Independent of APP_URL on purpose (no env
// access in this pure helper); an absolute URL to the app's own host is rejected as well.
const NEXT_BASE = "https://next.invalid";

/**
 * Only same-origin relative paths are allowed as redirect targets. Control characters and
 * backslashes are refused outright (browsers strip tabs/newlines and treat "\\" like "/", so
 * "/\t/evil.example" would become "//evil.example"); the rest is parsed like a browser would and
 * must stay on our origin. Returns the normalized path + query + hash.
 */
export function safeNext(next: string | string[] | undefined, fallback = "/start"): string {
  const value = Array.isArray(next) ? next[0] : next;
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  if (/[\x00-\x1f\x7f\\]/.test(value)) return fallback;
  let url: URL;
  try {
    url = new URL(value, NEXT_BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== NEXT_BASE) return fallback;
  // Encoded separators in the path ("/%2F%2Fevil") are refused like Better Auth does for its
  // callback URLs – some servers and proxies decode them before routing.
  if (/%2f|%5c/i.test(url.pathname)) return fallback;
  const path = `${url.pathname}${url.search}${url.hash}`;
  return path.startsWith("//") ? fallback : path;
}
