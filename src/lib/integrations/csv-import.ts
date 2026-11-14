import "server-only";
import { deleteImportUpload, loadImportContent, openCsvRun, pendingCsvIntegrationIds, type CsvCursor } from "@/db/queries/clickup-import";
import { listImportMembers } from "@/db/queries/import";
import { claimIntegration, errorCode, finishRun, releaseIntegration, renewLease, saveRun, syncActor, SyncWriter, type RunCounts, type SyncIntegration } from "@/db/queries/integration-sync";
import { readClickUpCsv } from "@/lib/import/clickup";
import { matchByName } from "./mapping";
import { PROVIDER_NAMES } from "./providers";

// Background run of a ClickUp CSV import (ADR 008, "CSV-Import"). Same writer as the API sync:
// one project per space, folder/list/tags as labels, statuses through the shared field mapping,
// idempotent via external_ref – a task the API sync or an earlier import already brought in is left
// as it is. Holds the integration's lease, so it never runs next to an API sync. The file is read
// from import_upload again after a restart and skipped up to the saved position; the run ends with
// the hierarchy pass and deletes the upload. Logs carry ids and error codes only.

const LEASE_MS = 5 * 60_000;
/** Progress is saved (and the lease renewed) after this many tasks. */
const BATCH = 100;
/** Database trouble: the run stays open and is retried; after this many attempts it gives up. */
const MAX_ATTEMPTS = 3;

export type CsvRunResult = { runId: string; counts: RunCounts; error: string | null; finished: boolean };

/** Errors that a retry cannot fix: the run ends at once. */
class FatalImportError extends Error {}

/**
 * Runs (or resumes) the open CSV import of an integration. Returns null when another worker holds
 * the lease or nothing is open. Never throws.
 */
export async function runCsvImport(integrationId: string): Promise<CsvRunResult | null> {
  const integ = await claimIntegration(integrationId, LEASE_MS, { keepRequest: true });
  if (!integ) return null;
  const run = await openCsvRun(integ).catch(() => null);
  if (!run) {
    await releaseIntegration(integ, {});
    return null;
  }
  const { counts, cursor } = run;
  try {
    await importFile(integ, run.id, counts, cursor);
    await finishRun(integ, run.id, counts, cursor, null);
    await deleteImportUpload(integ.workspaceId, cursor.uploadId);
    console.info("csv import: done", { integrationId, runId: run.id, created: counts.created, unchanged: counts.unchanged, errors: counts.errors });
    return { runId: run.id, counts, error: null, finished: true };
  } catch (e) {
    const code = e instanceof FatalImportError ? e.message : errorCode(e);
    cursor.attempts = (cursor.attempts ?? 0) + 1;
    const giveUp = e instanceof FatalImportError || cursor.attempts >= MAX_ATTEMPTS;
    console.error("csv import: run failed", { integrationId, runId: run.id, code, attempt: cursor.attempts, giveUp });
    try {
      if (giveUp) {
        await finishRun(integ, run.id, counts, cursor, code);
        await deleteImportUpload(integ.workspaceId, cursor.uploadId);
      } else await saveRun(integ, run.id, counts, cursor);
    } catch (inner) {
      console.error("csv import: saving the failure failed", { integrationId, code: errorCode(inner) });
    }
    return { runId: run.id, counts, error: code, finished: giveUp };
  } finally {
    await releaseIntegration(integ, {}).catch((e: unknown) => console.error("csv import: release failed", { integrationId, code: errorCode(e) }));
  }
}

async function importFile(integ: SyncIntegration, runId: string, counts: RunCounts, cursor: CsvCursor) {
  const content = await loadImportContent(integ.workspaceId, cursor.uploadId);
  if (content === null) throw new FatalImportError("upload_missing");
  const read = readClickUpCsv(content);
  if (!read.ok) throw new FatalImportError(read.error);

  const members = await listImportMembers(integ.workspaceId);
  const actorId = members.some((m) => m.id === cursor.actorId) ? cursor.actorId : await syncActor(integ);
  if (!actorId) throw new FatalImportError("no_active_member");
  const byName = matchByName(members);
  const spaceNames = new Map<string, string>();
  const writer = new SyncWriter(integ, actorId, PROVIDER_NAMES.clickup, spaceNames, { person: (p) => byName(p.name), createOnly: true });
  await writer.load();

  if (cursor.phase === "tasks") {
    let index = 0;
    for (const item of read.tasks) {
      index++;
      if (index <= cursor.done) continue;
      spaceNames.set(item.task.spaceId, item.spaceName);
      counts.read++;
      try {
        const r = await writer.importTask(item.task, item.comments);
        counts[r.result]++;
        counts.comments += r.comments;
      } catch (e) {
        counts.errors++;
        console.error("csv import: task failed", { integrationId: integ.id, taskId: item.task.id, code: errorCode(e) });
      }
      cursor.done = index;
      if (index % BATCH === 0) {
        await saveRun(integ, runId, counts, cursor);
        await renewLease(integ.id, LEASE_MS);
      }
    }
    // The generator went through the whole file (also on a resume), so the stats are complete.
    counts.duplicates = read.stats.duplicates;
    counts.skipped += read.stats.skipped.no_id + read.stats.skipped.no_title;
    cursor.phase = "links";
    await saveRun(integ, runId, counts, cursor);
    await renewLease(integ.id, LEASE_MS);
  }

  counts.unlinked = await writer.linkHierarchy();
  await writer.flushStatusMappings();
}

/** Worker hook (src/lib/integrations/engine.ts poller): resumes CSV runs left open by a restart. */
export async function resumeCsvImports() {
  for (const id of await pendingCsvIntegrationIds()) await runCsvImport(id);
}
