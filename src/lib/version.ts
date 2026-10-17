/**
 * Build "sha-<40 hex>" → "sha-<7 hex>" for /api/health: enough for scripts/deploy.sh to see the
 * new version, less to fingerprint the exact build from outside.
 */
export function shortVersion(raw: string | undefined): string {
  const m = /^sha-([0-9a-f]{7})[0-9a-f]*$/.exec(raw ?? "");
  return m ? `sha-${m[1]}` : (raw ?? "dev");
}
