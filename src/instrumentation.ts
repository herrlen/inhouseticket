// Next.js calls register() once per server start. In production a light in-process scheduler
// runs the daily digest (single container; the digest itself is idempotent per day).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  const { runDailyDigest } = await import("@/lib/digest");
  const tick = () => {
    runDailyDigest().catch((e: unknown) => console.error("digest: run failed", e instanceof Error ? e.message : e));
  };
  setTimeout(tick, 60_000);
  setInterval(tick, 15 * 60_000);
}
