// Next.js calls register() once per server start. In production a light in-process scheduler
// runs the daily digest (single container; the digest itself is idempotent per day) and deletes
// expired registrations (retention promised in the privacy policy, ADR 005).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  const { runDailyDigest } = await import("@/lib/digest");
  const { deleteExpiredRegistrations } = await import("@/db/queries/registrations");
  const tick = () => {
    runDailyDigest().catch((e: unknown) => console.error("digest: run failed", e instanceof Error ? e.message : e));
    deleteExpiredRegistrations().catch((e: unknown) => console.error("registrations: cleanup failed", e instanceof Error ? e.message : e));
  };
  setTimeout(tick, 60_000);
  setInterval(tick, 15 * 60_000);
}
