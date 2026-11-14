import "server-only";
import { claimIntegration, emptyCounts, errorCode, releaseIntegration, renewLease, syncActor, SyncWriter } from "@/db/queries/integration-sync";
import { clearEvents, dropEvent, openWebhook, queuedEvents, saveWebhook, setWebhookStatus, webhookState } from "@/db/queries/integration-webhooks";
import { openIntegrationToken } from "@/db/queries/integrations";
import { env } from "@/lib/env";
import { connectorFor, LEASE_MS, syncComments } from "./engine";
import { PROVIDER_NAMES, type WebhookStatus } from "./providers";
import { ConnectorError, type Connector, type ExternalTask } from "./types";

// Real-time events (ADR 008, addendum webhooks). The webhook only says *which* task changed; the
// task is then read through the API and written by the same SyncWriter as a poll – same mapping,
// idempotency (external change date), hierarchy and lease, so a webhook batch never runs next to a
// poll. Polling stays as the safety net (every 30 min while the webhook is healthy, else every 5).
// Logs carry ids and error codes only.

/** Where ClickUp posts the events of one integration. */
export const webhookPath = (integrationId: string) => `/api/integrations/clickup/webhook/${integrationId}`;

/** Public base for webhooks: only the production app on https – ClickUp cannot reach anything else. */
export function webhookBaseUrl(): string | null {
  if (env.NODE_ENV !== "production") return null;
  const base = env.APP_URL.replace(/\/+$/, "");
  return base.startsWith("https://") ? base : null;
}

/** A failed registration is retried this often (by the poller), not on every poll. */
const REGISTER_RETRY_MS = 60 * 60_000;
const EVENT_BATCH = 100;
/** One webhook batch is short: comments of the touched tasks, the rest follows with the next poll. */
const WEBHOOK_COMMENT_BUDGET_MS = 60_000;

type Options = {
  /** Test seam: a connector instead of one built from the stored token. */
  connector?: Connector;
  /** Test seam: the public base instead of APP_URL (null = no public URL). */
  baseUrl?: string | null;
};

async function connectorOf(workspaceId: string, integrationId: string, options: Options): Promise<Connector> {
  return options.connector ?? connectorFor("clickup", await openIntegrationToken(workspaceId, integrationId));
}

/**
 * (Re-)registers the webhook of an integration after the selection or the token changed: removes
 * the old one, creates a new one when there is a public URL and something is selected. Never
 * throws – a failure leaves status `failed` and polling every 5 minutes.
 */
export async function registerWebhook(workspaceId: string, integrationId: string, options: Options = {}): Promise<WebhookStatus | null> {
  const state = await webhookState(integrationId);
  if (!state || state.workspaceId !== workspaceId) return null;
  const cfg = state.config;
  const base = options.baseUrl !== undefined ? options.baseUrl : webhookBaseUrl();
  const wanted = Boolean(base && cfg.accountId && cfg.step === "done" && state.status === "active" && (cfg.spaceIds?.length || cfg.listIds?.length));
  if (!wanted && !state.hasWebhook) {
    if (state.webhookStatus) await saveWebhook(workspaceId, integrationId, null, null);
    return null;
  }
  let connector: Connector;
  try {
    connector = await connectorOf(workspaceId, integrationId, options);
  } catch (e) {
    console.error("integration webhook: token unavailable", { integrationId, code: errorCode(e) });
    await saveWebhook(workspaceId, integrationId, null, wanted ? "failed" : null);
    return wanted ? "failed" : null;
  }
  const api = connector.webhooks;
  const old = await openWebhook(workspaceId, integrationId);
  if (old && api) {
    try {
      await api.remove(old.id);
    } catch (e) {
      // Left over at ClickUp: its events no longer match our secret (401 suspends it there).
      console.warn("integration webhook: removing the old one failed", { integrationId, code: errorCode(e) });
    }
  }
  if (!wanted || !api || !base || !cfg.accountId) {
    await saveWebhook(workspaceId, integrationId, null, null);
    return null;
  }
  // A filter only fits a single whole space; anything else is filtered when the task is read.
  const spaceId = cfg.spaceIds?.length === 1 && !cfg.listIds?.length ? cfg.spaceIds[0] : undefined;
  try {
    const hook = await api.create(cfg.accountId, `${base}${webhookPath(integrationId)}`, { spaceId });
    await saveWebhook(workspaceId, integrationId, hook, "active");
    return "active";
  } catch (e) {
    console.error("integration webhook: registration failed", { integrationId, code: e instanceof ConnectorError ? e.code : errorCode(e) });
    await saveWebhook(workspaceId, integrationId, null, "failed");
    return "failed";
  }
}

/** "Trennen": removes the webhook at the provider (best effort) and locally. */
export async function removeWebhook(workspaceId: string, integrationId: string, options: Options = {}) {
  const old = await openWebhook(workspaceId, integrationId);
  if (old) {
    try {
      await (await connectorOf(workspaceId, integrationId, options)).webhooks?.remove(old.id);
    } catch (e) {
      // Stays at ClickUp until it is suspended there: our endpoint answers 404 for it.
      console.warn("integration webhook: removal failed", { integrationId, code: errorCode(e) });
    }
  }
  await saveWebhook(workspaceId, integrationId, null, null);
}

/**
 * Poller (after a scheduled run): reads the webhook's health at the provider. Gone or suspended →
 * register anew; failing deliveries → `failing` (polling every 5 min again); no webhook yet (new
 * public URL, failed registration an hour ago) → register.
 */
export async function maintainWebhook(integrationId: string, options: Options = {}): Promise<WebhookStatus | null> {
  const state = await webhookState(integrationId);
  if (!state || state.status !== "active" || state.config.step !== "done" || !state.config.accountId) return state?.webhookStatus ?? null;
  const base = options.baseUrl !== undefined ? options.baseUrl : webhookBaseUrl();
  const ws = state.workspaceId;
  if (!base) {
    if (state.hasWebhook || state.webhookStatus) return registerWebhook(ws, integrationId, options);
    return null;
  }
  if (!state.hasWebhook) {
    const recent = state.webhookCheckedAt && Date.now() - state.webhookCheckedAt.getTime() < REGISTER_RETRY_MS;
    return state.webhookStatus === "failed" && recent ? "failed" : registerWebhook(ws, integrationId, options);
  }
  try {
    const hook = await openWebhook(ws, integrationId);
    const api = (await connectorOf(ws, integrationId, options)).webhooks;
    if (!api) return state.webhookStatus;
    const found = hook ? (await api.list(state.config.accountId)).find((w) => w.id === hook.id) : undefined;
    if (!found || found.status === "suspended" || found.endpoint !== `${base}${webhookPath(integrationId)}`) return registerWebhook(ws, integrationId, options);
    const status: WebhookStatus = found.status === "active" ? "active" : "failing";
    await setWebhookStatus(ws, integrationId, status);
    return status;
  } catch (e) {
    console.error("integration webhook: health check failed", { integrationId, code: e instanceof ConnectorError ? e.code : errorCode(e) });
    return state.webhookStatus;
  }
}

const inSelection = (task: ExternalTask, cfg: { spaceIds?: string[]; listIds?: string[] }) =>
  Boolean((cfg.spaceIds ?? []).includes(task.spaceId) || (task.listId && (cfg.listIds ?? []).includes(task.listId)));

export type WebhookRunResult = { processed: number; created: number; updated: number; deleted: number; comments: number; error: string | null };

/**
 * Works off the queued events of one integration under its lease. Returns null when the lease is
 * taken (a poll or CSV import runs – the poller retries the queue every minute) or nothing is set
 * up. Events stay queued when the provider is unreachable; per-task problems drop the event.
 */
export async function processWebhookEvents(integrationId: string, options: Options = {}): Promise<WebhookRunResult | null> {
  // keepRequest: a pending "Jetzt abgleichen" is for the poll, not for this batch.
  const integ = await claimIntegration(integrationId, LEASE_MS, { keepRequest: true });
  if (!integ) return null;
  const cfg = integ.config;
  if (!cfg.accountId || cfg.step !== "done" || (!cfg.spaceIds?.length && !cfg.listIds?.length)) {
    await clearEvents(integ);
    await releaseIntegration(integ, {});
    return null;
  }
  const result: WebhookRunResult = { processed: 0, created: 0, updated: 0, deleted: 0, comments: 0, error: null };
  try {
    const connector = await connectorOf(integ.workspaceId, integ.id, options);
    const actorId = await syncActor(integ);
    if (!actorId) throw new Error("no_active_member");
    const spaces = await connector.listContainers(cfg.accountId, { shallow: true });
    const writer = new SyncWriter(integ, actorId, PROVIDER_NAMES[integ.provider], new Map(spaces.map((s) => [s.id, s.name])));
    await writer.load();

    for (;;) {
      const events = await queuedEvents(integ, EVENT_BATCH);
      if (!events.length) break;
      for (const ev of events) {
        try {
          if (ev.kind === "deleted") {
            if (await writer.markDeleted(ev.externalId)) result.deleted++;
          } else {
            const task = connector.getTask ? await connector.getTask(ev.externalId) : null;
            if (task && inSelection(task, cfg)) {
              const r = await writer.upsertTask(task);
              if (r === "created") result.created++;
              if (r === "updated") result.updated++;
            }
            if (ev.kind === "comment") await writer.requestComments(ev.externalId);
          }
        } catch (e) {
          // Token, limit or outage: stop, the events stay queued for the next attempt.
          if (e instanceof ConnectorError && e.code !== "not_found" && e.code !== "bad_response") throw e;
          console.error("integration webhook: event failed", { integrationId, taskId: ev.externalId, code: errorCode(e) });
        }
        await dropEvent(integ, ev);
        result.processed++;
      }
      await renewLease(integ.id, LEASE_MS);
    }

    await writer.linkHierarchy();
    await writer.flushStatusMappings();
    const counts = emptyCounts();
    await syncComments(integ, connector, writer, counts, WEBHOOK_COMMENT_BUDGET_MS, async () => {});
    result.comments = counts.comments;
    await releaseIntegration(integ, {});
    return result;
  } catch (e) {
    const code = e instanceof ConnectorError ? e.code : errorCode(e);
    console.error("integration webhook: batch failed", { integrationId, code });
    await releaseIntegration(integ, code === "unauthorized" ? { status: "error", lastError: code } : {});
    return { ...result, error: code };
  }
}
