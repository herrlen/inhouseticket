import "server-only";
import { and, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { emptyCounts, type RunCounts, type SyncIntegration } from "@/db/queries/integration-sync";
import type { IntegrationConfig } from "@/db/queries/integrations";
import { externalRef, fieldMapping, importUpload, integration, syncRun } from "@/db/schema";
import { IMPORT_UPLOAD_TTL_MS } from "@/lib/limits";
import { isStatusTarget, targetCategory, type StatusSuggestion, type StatusTarget } from "@/lib/integrations/mapping";
import type { Category } from "@/lib/import/source";

// Database side of the ClickUp CSV import (src/lib/integrations/csv-import.ts): the uploaded file,
// the run that imports it, and the ClickUp integration row the imported tickets hang on. The CSV
// shares that row with the API connector, so both ways in know the same Task IDs (external_ref).
// Every function filters by workspaceId (CLAUDE.md rule 1) except the two maintenance queries for
// the background worker, which return ids only.

/** Where a CSV run stands; saved after every batch (resume after a crash or restart). */
export type CsvCursor = {
  uploadId: string;
  /** Who started it – creator of the tickets, author of comments by people who are no member. */
  actorId: string;
  phase: "tasks" | "links";
  /** Unique tasks of the file already handled (in file order). */
  done: number;
  /** Tasks the preview counted (progress bar). */
  total: number;
  /** Failed attempts (database errors); after three the run ends with an error. */
  attempts?: number;
};

const CHUNK = 1000;

/** The workspace's ClickUp integration; without an API connection a row without token (CSV only). */
export async function ensureClickUpIntegration(workspaceId: string, userId: string): Promise<string> {
  const [existing] = await db
    .select({ id: integration.id })
    .from(integration)
    .where(and(eq(integration.workspaceId, workspaceId), eq(integration.provider, "clickup")))
    .limit(1);
  if (existing) return existing.id;
  // No credentials and no tokenHint: the settings page shows "not connected" and offers the token
  // step; connecting later fills this row, so the API sync finds the imported tasks again.
  await db.insert(integration).values({ workspaceId, provider: "clickup", credentials: "", config: { projectMode: "space" } satisfies IntegrationConfig, status: "setup", createdBy: userId }).onConflictDoNothing();
  const [row] = await db
    .select({ id: integration.id })
    .from(integration)
    .where(and(eq(integration.workspaceId, workspaceId), eq(integration.provider, "clickup")))
    .limit(1);
  return row!.id;
}

async function clickUpIntegrationId(workspaceId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: integration.id })
    .from(integration)
    .where(and(eq(integration.workspaceId, workspaceId), eq(integration.provider, "clickup")))
    .limit(1);
  return row?.id ?? null;
}

/** Confirmed status choices of the ClickUp connection (lower-case name → choice), for the preview. */
export async function clickUpStatusMappings(workspaceId: string): Promise<Map<string, StatusSuggestion>> {
  const integrationId = await clickUpIntegrationId(workspaceId);
  if (!integrationId) return new Map();
  const rows = await db
    .select({ externalValue: fieldMapping.externalValue, localValue: fieldMapping.localValue, meta: fieldMapping.meta })
    .from(fieldMapping)
    .where(and(eq(fieldMapping.workspaceId, workspaceId), eq(fieldMapping.integrationId, integrationId), eq(fieldMapping.kind, "status")));
  const out = new Map<string, StatusSuggestion>();
  for (const r of rows) {
    if (!isStatusTarget(r.localValue)) continue;
    const cat = r.meta.category;
    const category: Category = cat === "open" || cat === "active" || cat === "done" ? cat : targetCategory(r.localValue, "open");
    out.set(r.externalValue.trim().toLowerCase(), { target: r.localValue, category });
  }
  return out;
}

/** How many of these Task IDs already have a ticket (earlier import or API sync). */
export async function countKnownTasks(workspaceId: string, taskIds: string[]): Promise<number> {
  const integrationId = await clickUpIntegrationId(workspaceId);
  if (!integrationId || !taskIds.length) return 0;
  let known = 0;
  for (let i = 0; i < taskIds.length; i += CHUNK) {
    const [row] = await db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(externalRef)
      .where(and(eq(externalRef.workspaceId, workspaceId), eq(externalRef.integrationId, integrationId), eq(externalRef.entityType, "task"), inArray(externalRef.externalId, taskIds.slice(i, i + CHUNK))));
    known += row?.n ?? 0;
  }
  return known;
}

/** Stores an uploaded file for its import. Replaces the workspace's earlier, never started upload. */
export async function saveImportUpload(input: { workspaceId: string; userId: string; fileName: string; content: string; bytes: number; tasks: number }): Promise<string> {
  await db
    .delete(importUpload)
    .where(and(eq(importUpload.workspaceId, input.workspaceId), or(isNull(importUpload.runId), lt(importUpload.createdAt, new Date(Date.now() - IMPORT_UPLOAD_TTL_MS)))));
  const [row] = await db
    .insert(importUpload)
    .values({ workspaceId: input.workspaceId, source: "clickup", fileName: input.fileName.slice(0, 255), content: input.content, bytes: input.bytes, tasks: input.tasks, createdBy: input.userId })
    .returning({ id: importUpload.id });
  return row!.id;
}

export async function loadImportContent(workspaceId: string, uploadId: string): Promise<string | null> {
  const [row] = await db
    .select({ content: importUpload.content })
    .from(importUpload)
    .where(and(eq(importUpload.id, uploadId), eq(importUpload.workspaceId, workspaceId)))
    .limit(1);
  return row?.content ?? null;
}

export async function deleteImportUpload(workspaceId: string, uploadId: string) {
  await db.delete(importUpload).where(and(eq(importUpload.id, uploadId), eq(importUpload.workspaceId, workspaceId)));
}

/** Maintenance (background worker): uploads past their time, of any workspace. */
export async function deleteExpiredUploads(now = new Date()): Promise<number> {
  const rows = await db
    .delete(importUpload)
    .where(lt(importUpload.createdAt, new Date(now.getTime() - IMPORT_UPLOAD_TTL_MS)))
    .returning({ id: importUpload.id });
  return rows.length;
}

/** Maintenance (background worker): integrations with an unfinished CSV run. Ids only. */
export async function pendingCsvIntegrationIds(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ id: syncRun.integrationId })
    .from(syncRun)
    .where(and(eq(syncRun.trigger, "csv"), isNull(syncRun.finishedAt)));
  return rows.map((r) => r.id);
}

export type StartError = "not_found" | "busy";

/**
 * Starts the import of an upload: integration row, status choices (shared with the API
 * connector's mapping), and an open run the worker picks up. One CSV run per workspace at a time.
 */
export async function startClickUpCsvRun(
  actor: { workspaceId: string; userId: string },
  uploadId: string,
  statuses: Array<{ name: string; target: StatusTarget; category: Category }>,
): Promise<{ ok: true; runId: string; integrationId: string } | { ok: false; error: StartError }> {
  const ws = actor.workspaceId;
  const [upload] = await db
    .select({ id: importUpload.id, tasks: importUpload.tasks, runId: importUpload.runId })
    .from(importUpload)
    .where(and(eq(importUpload.id, uploadId), eq(importUpload.workspaceId, ws)))
    .limit(1);
  if (!upload) return { ok: false, error: "not_found" };
  if (upload.runId) return { ok: false, error: "busy" };
  const integrationId = await ensureClickUpIntegration(ws, actor.userId);

  return db.transaction(async (tx) => {
    // Serialises concurrent starts of the same workspace on the integration row.
    await tx.select({ id: integration.id }).from(integration).where(and(eq(integration.id, integrationId), eq(integration.workspaceId, ws))).for("update");
    const [open] = await tx
      .select({ id: syncRun.id })
      .from(syncRun)
      .where(and(eq(syncRun.integrationId, integrationId), eq(syncRun.workspaceId, ws), eq(syncRun.trigger, "csv"), isNull(syncRun.finishedAt)))
      .limit(1);
    if (open) return { ok: false as const, error: "busy" as const };
    if (statuses.length) {
      await tx
        .insert(fieldMapping)
        .values(statuses.map((s) => ({ workspaceId: ws, integrationId, kind: "status", externalValue: s.name.trim().slice(0, 200), localValue: s.target, meta: { category: s.category, source: "csv" } })))
        .onConflictDoUpdate({
          target: [fieldMapping.integrationId, fieldMapping.kind, fieldMapping.externalValue],
          set: { localValue: sql`excluded.local_value`, meta: sql`excluded.meta` },
          setWhere: eq(fieldMapping.workspaceId, ws),
        });
    }
    const cursor: CsvCursor = { uploadId, actorId: actor.userId, phase: "tasks", done: 0, total: upload.tasks };
    const [run] = await tx.insert(syncRun).values({ workspaceId: ws, integrationId, trigger: "csv", cursor }).returning({ id: syncRun.id });
    await tx.update(importUpload).set({ runId: run!.id }).where(and(eq(importUpload.id, uploadId), eq(importUpload.workspaceId, ws)));
    return { ok: true as const, runId: run!.id, integrationId };
  });
}

/** The unfinished CSV run of an integration (the worker holds the integration's lease). */
export async function openCsvRun(integ: SyncIntegration): Promise<{ id: string; counts: RunCounts; cursor: CsvCursor } | null> {
  const [row] = await db
    .select({ id: syncRun.id, counts: syncRun.counts, cursor: syncRun.cursor })
    .from(syncRun)
    .where(and(eq(syncRun.integrationId, integ.id), eq(syncRun.workspaceId, integ.workspaceId), eq(syncRun.trigger, "csv"), isNull(syncRun.finishedAt)))
    .orderBy(desc(syncRun.startedAt))
    .limit(1);
  return row ? { id: row.id, counts: { ...emptyCounts(), ...row.counts }, cursor: row.cursor as CsvCursor } : null;
}

export type CsvRunView = {
  id: string;
  integrationId: string;
  startedAt: Date;
  finishedAt: Date | null;
  error: string | null;
  counts: RunCounts;
  done: number;
  total: number;
  /** A worker holds the lease right now. */
  running: boolean;
};

const runColumns = {
  id: syncRun.id,
  integrationId: syncRun.integrationId,
  startedAt: syncRun.startedAt,
  finishedAt: syncRun.finishedAt,
  error: syncRun.error,
  counts: syncRun.counts,
  cursor: syncRun.cursor,
  lockedUntil: integration.lockedUntil,
};

function toRunView(r: { id: string; integrationId: string; startedAt: Date; finishedAt: Date | null; error: string | null; counts: Record<string, number>; cursor: Record<string, unknown>; lockedUntil: Date | null }): CsvRunView {
  const cursor = r.cursor as Partial<CsvCursor>;
  return {
    id: r.id,
    integrationId: r.integrationId,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    error: r.error,
    counts: { ...emptyCounts(), ...r.counts },
    done: cursor.done ?? 0,
    total: cursor.total ?? 0,
    running: Boolean(!r.finishedAt && r.lockedUntil && r.lockedUntil.getTime() > Date.now()),
  };
}

export async function findCsvRun(workspaceId: string, runId: string): Promise<CsvRunView | null> {
  const [row] = await db
    .select(runColumns)
    .from(syncRun)
    .innerJoin(integration, and(eq(integration.id, syncRun.integrationId), eq(integration.workspaceId, syncRun.workspaceId)))
    .where(and(eq(syncRun.id, runId), eq(syncRun.workspaceId, workspaceId), eq(syncRun.trigger, "csv")))
    .limit(1);
  return row ? toRunView(row) : null;
}

/** The workspace's running CSV run, or the one finished within `finishedWithinMs` (shown again on return). */
export async function latestCsvRun(workspaceId: string, finishedWithinMs: number): Promise<CsvRunView | null> {
  const [row] = await db
    .select(runColumns)
    .from(syncRun)
    .innerJoin(integration, and(eq(integration.id, syncRun.integrationId), eq(integration.workspaceId, syncRun.workspaceId)))
    .where(and(eq(syncRun.workspaceId, workspaceId), eq(syncRun.trigger, "csv"), or(isNull(syncRun.finishedAt), gt(syncRun.finishedAt, new Date(Date.now() - finishedWithinMs)))))
    .orderBy(desc(syncRun.startedAt))
    .limit(1);
  return row ? toRunView(row) : null;
}
