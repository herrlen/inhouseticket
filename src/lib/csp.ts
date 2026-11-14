/**
 * Content Security Policy for HTML pages, built per request in src/proxy.ts.
 * Scripts need the per-request nonce (Next.js adds it to its own scripts); 'strict-dynamic' lets
 * them load the lazy chunks. Styles allow 'unsafe-inline' because React style attributes cannot
 * carry a nonce. img-src stays on our origin, so foreign avatar URLs never load.
 */
export function contentSecurityPolicy(nonce: string, dev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/** Headers for every response (pages, API, MCP, static files) – see next.config.ts. */
export const SECURITY_HEADERS = [
  // HTTPS only for a year, on every subdomain too (app., www.). Browsers ignore it over plain http,
  // so local and E2E runs on http://localhost are unaffected. No preload: that is hard to undo.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  // Invite links carry their token in the path – never leak it to other sites.
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];
