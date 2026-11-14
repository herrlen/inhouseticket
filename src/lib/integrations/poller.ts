import "server-only";
import { deleteExpiredUploads } from "@/db/queries/clickup-import";
import { dueIntegrationIds, errorCode } from "@/db/queries/integration-sync";
import { integrationsWithEvents } from "@/db/queries/integration-webhooks";
import { env } from "@/lib/env";
import { resumeCsvImports } from "./csv-import";
import { runSync } from "./engine";
import { POLL_INTERVAL_MS, WEBHOOK_POLL_INTERVAL_MS } from "./providers";
import { maintainWebhook, processWebhookEvents } from "./webhook-sync";

let polling = false;

/**
 * Production scheduler (src/instrumentation.ts), every minute: CSV imports left open by a restart
 * (no token needed), expired uploads, due integrations one after another (every 5 minutes, every
 * 30 while their webhook is healthy) with a webhook health check after each scheduled run, and
 * webhook events that waited for a lease.
 */
export function startIntegrationPolling() {
  const tick = async () => {
    if (polling) return;
    polling = true;
    try {
      await resumeCsvImports();
      await deleteExpiredUploads();
      if (env.INTEGRATION_SECRET) {
        for (const id of await dueIntegrationIds(POLL_INTERVAL_MS, WEBHOOK_POLL_INTERVAL_MS)) {
          const run = await runSync(id, "schedule");
          if (run && !run.error) await maintainWebhook(id);
        }
        for (const id of await integrationsWithEvents()) await processWebhookEvents(id);
      }
    } catch (e) {
      console.error("integration sync: poll failed", errorCode(e));
    } finally {
      polling = false;
    }
  };
  setTimeout(tick, 90_000);
  setInterval(tick, 60_000);
}
