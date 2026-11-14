import "server-only";
import {
  claimIntegration,
  dueIntegrationIds,
  errorCode,
  finishRun,
  lastDeltaMark,
  openRun,
  releaseIntegration,
  renewLease,
  saveRun,
  syncActor,
  SyncWriter,
  type RunCounts,
  type RunCursor,
  type SyncIntegration,
} from "@/db/queries/integration-sync";
import { deleteExpiredUploads } from "@/db/queries/clickup-import";
import { openIntegrationToken } from "@/db/queries/integrations";
import { env } from "@/lib/env";
import { CredentialsError } from "./crypto";
import { resumeCsvImports } from "./csv-import";
import { POLL_INTERVAL_MS, PROVIDER_NAMES, type ProviderId, type SyncTrigger } from "./providers";
import { createConnector } from "./registry";
import { ConnectorError, type Connector } from "./types";

// Sync engine: one run = tasks (paged, resumable) → hierarchy links → comments (time-boxed, the
// rest continues in the next run). A lease on the integration row makes sure only one worker
// runs per integration, across restarts and containers. Progress is saved after every page, so a
// crashed run resumes from its cursor. Logs carry ids and error codes only – never tokens or content.

const LEASE_MS = 5 * 60_000;
/** Comments cost one request per task: at most this long per run, the rest follows next time. */
const COMMENT_BUDGET_MS = 4 * 60_000;
const COMMENT_BATCH = 25;
/** Overlap for the delta: ClickUp's filter is "greater than", clocks and pages may lag a little. */
const DELTA_OVERLAP_MS = 60_000;

/** Connector for a stored token; the API base can only be redirected outside production (E2E mock). */
export function connectorFor(provider: ProviderId, token: string): Connector {
  const baseUrl = env.NODE_ENV !== "production" ? env.CLICKUP_API_URL : undefined;
  return createConnector(provider, { token, baseUrl });
}

export type RunResult = { runId: string; counts: RunCounts; error: string | null };

export type RunOptions = {
  /** Test seam: a connector instead of one built from the stored token. */
  connector?: Connector;
  commentBudgetMs?: number;
};

/**
 * Runs (or resumes) one sync of an integration. Returns null when the integration is busy, not
 * set up or unknown. Never throws – failures end the run with an error code in the protocol.
 */
export async function runSync(integrationId: string, trigger: SyncTrigger, options: RunOptions = {}): Promise<RunResult | null> {
  const integ = await claimIntegration(integrationId, LEASE_MS);
  if (!integ) return null;
  const cfg = integ.config;
  if (!cfg.accountId || cfg.step !== "done" || (!cfg.spaceIds?.length && !cfg.listIds?.length)) {
    await releaseIntegration(integ, {});
    return null;
  }

  let connector = options.connector;
  if (!connector) {
    try {
      connector = connectorFor(integ.provider, await openIntegrationToken(integ.workspaceId, integ.id));
    } catch (e) {
      const code = e instanceof CredentialsError ? "token_unreadable" : errorCode(e);
      console.error("integration sync: token unavailable", { integrationId, code });
      await releaseIntegration(integ, { status: "error", lastError: code, lastSyncAt: new Date() });
      return null;
    }
  }

  const run = await openRun(integ, trigger);
  const counts = run.counts;
  const cursor: RunCursor = run.resumed ? run.cursor : {};
  try {
    const actorId = await syncActor(integ);
    if (!actorId) throw new Error("no_active_member");
    if (!run.resumed) {
      const mark = cfg.fullResync ? null : await lastDeltaMark(integ);
      cursor.phase = "tasks";
      cursor.since = mark ? new Date(mark.getTime() - DELTA_OVERLAP_MS).toISOString() : null;
      cursor.query = 0;
      cursor.page = 0;
      cursor.maxUpdated = mark?.toISOString() ?? null;
    }

    const spaces = await connector.listContainers(cfg.accountId, { shallow: true });
    const writer = new SyncWriter(integ, actorId, PROVIDER_NAMES[integ.provider], new Map(spaces.map((s) => [s.id, s.name])));
    await writer.load();

    if (cursor.phase === "tasks") {
      const pages = connector.pull(
        { accountId: cfg.accountId, spaceIds: cfg.spaceIds ?? [], listIds: cfg.listIds ?? [] },
        { since: cursor.since ? new Date(cursor.since) : null, startQuery: cursor.query ?? 0, startPage: cursor.page ?? 0 },
      );
      for await (const page of pages) {
        for (const task of page.tasks) {
          counts.read++;
          try {
            counts[await writer.upsertTask(task)]++;
          } catch (e) {
            counts.errors++;
            console.error("integration sync: task failed", { integrationId, taskId: task.id, code: errorCode(e) });
          }
          if (task.updatedAt && (!cursor.maxUpdated || task.updatedAt.toISOString() > cursor.maxUpdated)) cursor.maxUpdated = task.updatedAt.toISOString();
        }
        cursor.query = page.query;
        cursor.page = page.page + 1;
        await saveRun(integ, run.id, counts, cursor);
        await renewLease(integ.id, LEASE_MS);
      }
      cursor.phase = "links";
      await saveRun(integ, run.id, counts, cursor);
    }

    if (cursor.phase === "links") {
      counts.unlinked = await writer.linkHierarchy();
      cursor.phase = "comments";
      await saveRun(integ, run.id, counts, cursor);
    }

    await writer.flushStatusMappings();
    await syncComments(integ, connector, writer, counts, options.commentBudgetMs ?? COMMENT_BUDGET_MS, () => saveRun(integ, run.id, counts, cursor));

    await finishRun(integ, run.id, counts, cursor, null);
    await releaseIntegration(integ, { lastSyncAt: new Date(), status: "active", lastError: null, clearFullResync: Boolean(cfg.fullResync) });
    return { runId: run.id, counts, error: null };
  } catch (e) {
    const code = e instanceof ConnectorError ? e.code : errorCode(e);
    console.error("integration sync: run failed", { integrationId, code });
    await finishRun(integ, run.id, counts, cursor, code);
    // A revoked token needs a person; anything else is retried by the next poll.
    await releaseIntegration(integ, { lastSyncAt: new Date(), lastError: code, ...(code === "unauthorized" ? { status: "error" as const } : {}) });
    return { runId: run.id, counts, error: code };
  }
}

async function syncComments(integ: SyncIntegration, connector: Connector, writer: SyncWriter, counts: RunCounts, budgetMs: number, save: () => Promise<void>) {
  const until = Date.now() + budgetMs;
  while (Date.now() < until) {
    const batch = await writer.pendingCommentTasks(COMMENT_BATCH);
    if (!batch.length) return;
    for (const task of batch) {
      if (Date.now() >= until) break;
      const comments = [];
      try {
        for await (const c of connector.pullComments(task.externalId)) comments.push(c);
        counts.comments += await writer.saveComments(task, comments);
      } catch (e) {
        // Token, limit or outage problems end the run (retried next time); anything about this one
        // task (deleted in the source, a row the database refuses) is counted and not retried.
        if (e instanceof ConnectorError && e.code !== "not_found" && e.code !== "bad_response") throw e;
        counts.errors++;
        console.error("integration sync: comments failed", { integrationId: integ.id, taskId: task.externalId, code: errorCode(e) });
        await writer.saveComments(task, []);
      }
    }
    await save();
    await renewLease(integ.id, LEASE_MS);
  }
}

let polling = false;

/**
 * Production scheduler (src/instrumentation.ts), every minute: CSV imports left open by a restart
 * (no token needed), expired uploads, then due integrations one after another.
 */
export function startIntegrationPolling() {
  const tick = async () => {
    if (polling) return;
    polling = true;
    try {
      await resumeCsvImports();
      await deleteExpiredUploads();
      if (env.INTEGRATION_SECRET) for (const id of await dueIntegrationIds(POLL_INTERVAL_MS)) await runSync(id, "schedule");
    } catch (e) {
      console.error("integration sync: poll failed", errorCode(e));
    } finally {
      polling = false;
    }
  };
  setTimeout(tick, 90_000);
  setInterval(tick, 60_000);
}
