import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { lastProjectSort } from "@/db/queries/explorer";
import { createProjectWithDefaults, nextTicketNumber, projectKeyTaken } from "@/db/queries/projects";
import { activity, comment, externalRef, fieldMapping, integration, label, membership, project, status, subtask, syncRun, ticket, ticketLabel } from "@/db/schema";
import { keyBetween } from "@/lib/fractional";
import type { Category } from "@/lib/import/source";
import type { IntegrationConfig } from "@/db/queries/integrations";
import { desiredParents, suggestStatus, targetCategory, taskLabels, ticketFields, isStatusTarget, type StatusSuggestion } from "@/lib/integrations/mapping";
import type { ProviderId, SyncTrigger } from "@/lib/integrations/providers";
import type { ExternalComment, ExternalStatus, ExternalTask } from "@/lib/integrations/types";
import { MAX_COMMENT } from "@/lib/limits";
import { PALETTE } from "@/lib/palette";
import { suggestProjectKey } from "@/lib/project-key";
import { initialSortKey } from "@/lib/sort-key";
import { dueDateToTimestamp } from "@/lib/validation/ticket";

// Database side of the sync engine (src/lib/integrations/engine.ts): lease, run protocol and the
// idempotent writes. All writes are scoped to the integration's workspace; tickets are written
// directly (no notifications, no per-field activity) – a sync is not a person editing.

// ---------------------------------------------------------------------------
// Lease and run protocol
// ---------------------------------------------------------------------------

export type SyncIntegration = { id: string; workspaceId: string; provider: ProviderId; config: IntegrationConfig; createdBy: string | null };

/** Takes the lease if free (or expired). Returns null when another worker holds it. */
export async function claimIntegration(integrationId: string, leaseMs: number): Promise<SyncIntegration | null> {
  const [row] = await db
    .update(integration)
    .set({ lockedUntil: new Date(Date.now() + leaseMs), syncRequestedAt: null })
    .where(and(eq(integration.id, integrationId), or(isNull(integration.lockedUntil), lt(integration.lockedUntil, new Date()))))
    .returning({ id: integration.id, workspaceId: integration.workspaceId, provider: integration.provider, config: integration.config, createdBy: integration.createdBy });
  return row ? { ...row, provider: row.provider as ProviderId, config: row.config as IntegrationConfig } : null;
}

export async function renewLease(integrationId: string, leaseMs: number) {
  await db.update(integration).set({ lockedUntil: new Date(Date.now() + leaseMs) }).where(eq(integration.id, integrationId));
}

export async function releaseIntegration(
  integ: SyncIntegration,
  patch: { lastSyncAt?: Date; status?: "active" | "error"; lastError?: string | null; clearFullResync?: boolean },
) {
  await db
    .update(integration)
    .set({
      lockedUntil: null,
      ...(patch.lastSyncAt ? { lastSyncAt: patch.lastSyncAt } : {}),
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.lastError !== undefined ? { lastError: patch.lastError } : {}),
      ...(patch.clearFullResync ? { config: sql`${integration.config} - 'fullResync'` } : {}),
    })
    .where(and(eq(integration.id, integ.id), eq(integration.workspaceId, integ.workspaceId)));
}

/** Active integrations whose interval is over or that were asked to sync, and not running. */
export async function dueIntegrationIds(intervalMs: number): Promise<string[]> {
  const before = new Date(Date.now() - intervalMs);
  const rows = await db
    .select({ id: integration.id })
    .from(integration)
    .where(
      and(
        eq(integration.status, "active"),
        or(isNull(integration.lockedUntil), lt(integration.lockedUntil, new Date())),
        or(isNull(integration.lastSyncAt), lt(integration.lastSyncAt, before), isNotNull(integration.syncRequestedAt)),
      ),
    )
    .orderBy(asc(sql`coalesce(${integration.lastSyncAt}, 'epoch'::timestamptz)`));
  return rows.map((r) => r.id);
}

export type RunCursor = {
  phase?: "tasks" | "links" | "comments";
  query?: number;
  page?: number;
  /** ISO – the delta start of this run (null = everything). */
  since?: string | null;
  /** ISO – newest external change seen; the next run's delta starts here. */
  maxUpdated?: string | null;
};

export type RunCounts = { read: number; created: number; updated: number; unchanged: number; skipped: number; errors: number; comments: number; unlinked: number };
export const emptyCounts = (): RunCounts => ({ read: 0, created: 0, updated: 0, unchanged: 0, skipped: 0, errors: 0, comments: 0, unlinked: 0 });

/** Resumes the unfinished run of this integration (crash, restart) or starts a new one. */
export async function openRun(integ: SyncIntegration, trigger: SyncTrigger): Promise<{ id: string; counts: RunCounts; cursor: RunCursor; resumed: boolean }> {
  const [open] = await db
    .select({ id: syncRun.id, counts: syncRun.counts, cursor: syncRun.cursor })
    .from(syncRun)
    .where(and(eq(syncRun.integrationId, integ.id), eq(syncRun.workspaceId, integ.workspaceId), isNull(syncRun.finishedAt)))
    .orderBy(desc(syncRun.startedAt))
    .limit(1);
  if (open) return { id: open.id, counts: { ...emptyCounts(), ...open.counts }, cursor: open.cursor as RunCursor, resumed: true };
  const [created] = await db.insert(syncRun).values({ workspaceId: integ.workspaceId, integrationId: integ.id, trigger }).returning({ id: syncRun.id });
  return { id: created!.id, counts: emptyCounts(), cursor: {}, resumed: false };
}

export async function saveRun(integ: SyncIntegration, runId: string, counts: RunCounts, cursor: RunCursor) {
  await db.update(syncRun).set({ counts, cursor }).where(and(eq(syncRun.id, runId), eq(syncRun.workspaceId, integ.workspaceId)));
}

export async function finishRun(integ: SyncIntegration, runId: string, counts: RunCounts, cursor: RunCursor, error: string | null) {
  await db
    .update(syncRun)
    .set({ counts, cursor, error: error?.slice(0, 500) ?? null, finishedAt: new Date() })
    .where(and(eq(syncRun.id, runId), eq(syncRun.workspaceId, integ.workspaceId)));
}

/** Where the next delta starts: newest change seen by the last run that finished without error. */
export async function lastDeltaMark(integ: SyncIntegration): Promise<Date | null> {
  const [row] = await db
    .select({ cursor: syncRun.cursor })
    .from(syncRun)
    .where(and(eq(syncRun.integrationId, integ.id), eq(syncRun.workspaceId, integ.workspaceId), isNotNull(syncRun.finishedAt), isNull(syncRun.error)))
    .orderBy(desc(syncRun.finishedAt))
    .limit(1);
  const iso = (row?.cursor as RunCursor | undefined)?.maxUpdated;
  return iso ? new Date(iso) : null;
}

/** Who appears as creator of synced tickets: the person who connected, else the first owner. */
export async function syncActor(integ: SyncIntegration): Promise<string | null> {
  const rows = await db
    .select({ userId: membership.userId, role: membership.role })
    .from(membership)
    .where(and(eq(membership.workspaceId, integ.workspaceId), eq(membership.status, "active")))
    .orderBy(asc(membership.createdAt));
  if (integ.createdBy && rows.some((r) => r.userId === integ.createdBy)) return integ.createdBy;
  return rows.find((r) => r.role === "owner")?.userId ?? rows[0]?.userId ?? null;
}

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------

type StatusRow = { id: string; name: string; category: Category; sort: string };
export type UpsertResult = "created" | "updated" | "unchanged" | "skipped";

/** Holds the per-run caches (projects, statuses, labels, mappings); one instance per run. */
export class SyncWriter {
  private readonly ws: string;
  private statusMap = new Map<string, StatusSuggestion>();
  private userMap = new Map<string, string | null>();
  private activeMembers = new Set<string>();
  private readonly newStatuses = new Map<string, { status: ExternalStatus; suggestion: StatusSuggestion }>();
  private readonly projects = new Map<string, string>();
  private readonly statuses = new Map<string, StatusRow[]>();
  private readonly labels = new Map<string, Map<string, string>>();
  private readonly tops = new Map<string, string | null>();

  constructor(
    private readonly integ: SyncIntegration,
    private readonly actorId: string,
    private readonly sourceName: string,
    /** Space id → name, for new projects. */
    private readonly spaceNames: Map<string, string>,
  ) {
    this.ws = integ.workspaceId;
  }

  async load() {
    const [maps, members] = await Promise.all([
      db
        .select({ kind: fieldMapping.kind, externalValue: fieldMapping.externalValue, localValue: fieldMapping.localValue, meta: fieldMapping.meta })
        .from(fieldMapping)
        .where(and(eq(fieldMapping.integrationId, this.integ.id), eq(fieldMapping.workspaceId, this.ws))),
      db
        .select({ userId: membership.userId })
        .from(membership)
        .where(and(eq(membership.workspaceId, this.ws), eq(membership.status, "active"))),
    ]);
    this.activeMembers = new Set(members.map((m) => m.userId));
    for (const m of maps) {
      if (m.kind === "status" && isStatusTarget(m.localValue)) {
        const cat = m.meta.category;
        const category: Category = cat === "open" || cat === "active" || cat === "done" ? cat : targetCategory(m.localValue, "open");
        this.statusMap.set(m.externalValue.toLowerCase(), { target: m.localValue, category });
      } else if (m.kind === "user") {
        this.userMap.set(m.externalValue, m.localValue && this.activeMembers.has(m.localValue) ? m.localValue : null);
      }
    }
  }

  private member(externalId: string | undefined): string | null {
    if (!externalId) return null;
    const id = this.userMap.get(externalId) ?? null;
    return id && this.activeMembers.has(id) ? id : null;
  }

  /** Project for a space: created on first use (one project per space), found again via external_ref. */
  async projectFor(spaceId: string): Promise<string> {
    const cached = this.projects.get(spaceId);
    if (cached) return cached;
    const [ref] = await db
      .select({ id: externalRef.id, localId: externalRef.localId, exists: sql<boolean>`exists (select 1 from "project" p where p."id" = "external_ref"."local_id" and p."workspace_id" = ${this.ws})` })
      .from(externalRef)
      .where(and(eq(externalRef.integrationId, this.integ.id), eq(externalRef.entityType, "space"), eq(externalRef.externalId, spaceId)))
      .limit(1);
    if (ref?.exists) {
      this.projects.set(spaceId, ref.localId);
      return ref.localId;
    }
    const name = (this.spaceNames.get(spaceId) ?? "ClickUp").replace(/\s+/g, " ").trim().slice(0, 100) || "ClickUp";
    const key = await this.freeKey(name);
    const colors = Object.values(PALETTE);
    const projectId = await db.transaction(async (tx) => {
      const count = await tx.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(project).where(eq(project.workspaceId, this.ws));
      const { project: p } = await createProjectWithDefaults(tx, {
        workspaceId: this.ws,
        name,
        key,
        color: colors[(count[0]?.n ?? 0) % colors.length]!,
        sort: keyBetween(await lastProjectSort(this.ws, null), null),
      });
      if (ref) await tx.update(externalRef).set({ localId: p.id }).where(eq(externalRef.id, ref.id));
      else await tx.insert(externalRef).values({ workspaceId: this.ws, integrationId: this.integ.id, entityType: "space", externalId: spaceId, localId: p.id });
      return p.id;
    });
    this.projects.set(spaceId, projectId);
    return projectId;
  }

  private async freeKey(name: string): Promise<string> {
    const base = suggestProjectKey(name).slice(0, 8);
    if (!(await projectKeyTaken(this.ws, base))) return base;
    for (let n = 2; n < 1000; n++) {
      const key = `${base}${n}`.slice(0, 10);
      if (!(await projectKeyTaken(this.ws, key))) return key;
    }
    throw new Error("no_free_project_key");
  }

  private async statusesOf(projectId: string): Promise<StatusRow[]> {
    let rows = this.statuses.get(projectId);
    if (!rows) {
      rows = await db
        .select({ id: status.id, name: status.name, category: status.category, sort: status.sort })
        .from(status)
        .where(and(eq(status.projectId, projectId), eq(status.workspaceId, this.ws)))
        .orderBy(asc(status.sort));
      this.statuses.set(projectId, rows);
    }
    return rows;
  }

  /** Local status for an external one, via the confirmed mapping (or a suggestion for new names). */
  async statusFor(projectId: string, ext: ExternalStatus): Promise<StatusRow> {
    const extName = ext.name.trim();
    const key = extName.toLowerCase();
    let mapping = this.statusMap.get(key);
    if (!mapping) {
      mapping = extName ? suggestStatus(ext) : { target: "Offen", category: "open" };
      this.statusMap.set(key, mapping);
      if (extName) this.newStatuses.set(key, { status: ext, suggestion: mapping });
    }
    const rows = await this.statusesOf(projectId);
    if (mapping.target !== "own") {
      const wanted = mapping.target.toLowerCase();
      const cat = targetCategory(mapping.target, mapping.category);
      return rows.find((s) => s.name.toLowerCase() === wanted) ?? rows.find((s) => s.category === cat) ?? rows[0]!;
    }
    const name = extName.slice(0, 50);
    const found = rows.find((s) => s.name.toLowerCase() === name.toLowerCase());
    if (found) return found;
    const [created] = await db
      .insert(status)
      .values({
        workspaceId: this.ws,
        projectId,
        name,
        color: ext.color && /^#[0-9a-f]{6}$/i.test(ext.color) ? ext.color : "#78716C",
        category: mapping.category,
        sort: keyBetween(rows.at(-1)?.sort ?? initialSortKey(0), null),
      })
      .returning({ id: status.id, name: status.name, category: status.category, sort: status.sort });
    rows.push(created!);
    return created!;
  }

  /** Suggestions for statuses first seen during the run, so the settings page can show them. */
  async flushStatusMappings() {
    if (!this.newStatuses.size) return;
    await db
      .insert(fieldMapping)
      .values(
        [...this.newStatuses.values()].map(({ status: s, suggestion }) => ({
          workspaceId: this.ws,
          integrationId: this.integ.id,
          kind: "status",
          externalValue: s.name.trim().slice(0, 200),
          localValue: suggestion.target,
          meta: { category: suggestion.category, color: s.color, type: s.type, auto: true },
        })),
      )
      .onConflictDoNothing();
    this.newStatuses.clear();
  }

  private async labelIds(projectId: string, names: string[]): Promise<string[]> {
    if (!names.length) return [];
    let byName = this.labels.get(projectId);
    if (!byName) {
      const rows = await db.select({ id: label.id, name: label.name }).from(label).where(and(eq(label.projectId, projectId), eq(label.workspaceId, this.ws)));
      byName = new Map(rows.map((r) => [r.name.toLowerCase(), r.id]));
      this.labels.set(projectId, byName);
    }
    const missing = names.filter((n) => !byName.has(n.toLowerCase()));
    if (missing.length) {
      const colors = Object.values(PALETTE);
      await db
        .insert(label)
        .values(missing.map((name, i) => ({ workspaceId: this.ws, projectId, name, color: colors[(byName.size + i) % colors.length]! })))
        .onConflictDoNothing();
      const rows = await db.select({ id: label.id, name: label.name }).from(label).where(and(eq(label.projectId, projectId), eq(label.workspaceId, this.ws)));
      for (const r of rows) byName.set(r.name.toLowerCase(), r.id);
    }
    return names.map((n) => byName.get(n.toLowerCase())).filter((id): id is string => Boolean(id));
  }

  private async topSort(projectId: string): Promise<string | null> {
    if (!this.tops.has(projectId)) {
      const [top] = await db
        .select({ sort: ticket.sort })
        .from(ticket)
        .where(and(eq(ticket.projectId, projectId), eq(ticket.workspaceId, this.ws)))
        .orderBy(asc(ticket.sort))
        .limit(1);
      this.tops.set(projectId, top?.sort ?? null);
    }
    return this.tops.get(projectId) ?? null;
  }

  /**
   * Creates or updates the ticket of one task, idempotent via external_ref. Unchanged tasks (same
   * external change date) are skipped. Parent links are set later by linkHierarchy(). A ticket
   * deleted by hand stays deleted.
   */
  async upsertTask(task: ExternalTask): Promise<UpsertResult> {
    const fields = ticketFields(task, this.sourceName);
    if (!fields || !task.spaceId) return "skipped";
    const [ref] = await db
      .select({ id: externalRef.id, localId: externalRef.localId, externalUpdatedAt: externalRef.externalUpdatedAt })
      .from(externalRef)
      .where(and(eq(externalRef.integrationId, this.integ.id), eq(externalRef.entityType, "task"), eq(externalRef.externalId, task.id)))
      .limit(1);
    const assigneeId = this.member(task.assignees[0]?.id);
    const labels = taskLabels(task);
    const refPatch = { externalParentId: task.parentId, externalUpdatedAt: task.updatedAt, url: task.url?.slice(0, 500) ?? null, pendingDetail: true };

    if (ref) {
      if (ref.externalUpdatedAt && task.updatedAt && ref.externalUpdatedAt.getTime() >= task.updatedAt.getTime()) return "unchanged";
      const [cur] = await db
        .select({ id: ticket.id, projectId: ticket.projectId, statusId: ticket.statusId, completedAt: ticket.completedAt })
        .from(ticket)
        .where(and(eq(ticket.id, ref.localId), eq(ticket.workspaceId, this.ws)))
        .limit(1);
      if (!cur) {
        await db.update(externalRef).set({ ...refPatch, pendingDetail: false }).where(eq(externalRef.id, ref.id));
        return "unchanged";
      }
      // A task moved to another space stays in its project (moving tickets renumbers them).
      const st = await this.statusFor(cur.projectId, task.status);
      const wasDone = (await this.statusesOf(cur.projectId)).find((s) => s.id === cur.statusId)?.category === "done";
      const labelIds = await this.labelIds(cur.projectId, labels);
      await db.transaction(async (tx) => {
        await tx
          .update(ticket)
          .set({
            title: fields.title,
            description: fields.description,
            statusId: st.id,
            priority: fields.priority,
            assigneeId,
            dueAt: dueDateToTimestamp(fields.dueDate),
            completedAt: st.category === "done" ? (wasDone && cur.completedAt ? cur.completedAt : (task.doneAt ?? new Date())) : null,
          })
          .where(and(eq(ticket.id, cur.id), eq(ticket.workspaceId, this.ws)));
        // Labels from the source are added; labels set by hand are never removed.
        if (labelIds.length) await tx.insert(ticketLabel).values(labelIds.map((labelId) => ({ ticketId: cur.id, labelId, projectId: cur.projectId }))).onConflictDoNothing();
        await tx.update(externalRef).set(refPatch).where(eq(externalRef.id, ref.id));
      });
      return "updated";
    }

    const projectId = await this.projectFor(task.spaceId);
    const st = await this.statusFor(projectId, task.status);
    const labelIds = await this.labelIds(projectId, labels);
    const sort = keyBetween(null, await this.topSort(projectId));
    await db.transaction(async (tx) => {
      const number = await nextTicketNumber(tx, projectId);
      const [created] = await tx
        .insert(ticket)
        .values({
          workspaceId: this.ws,
          projectId,
          number,
          title: fields.title,
          description: fields.description,
          statusId: st.id,
          priority: fields.priority,
          assigneeId,
          dueAt: dueDateToTimestamp(fields.dueDate),
          sort,
          createdBy: this.actorId,
          createdAt: task.createdAt ?? undefined,
          completedAt: st.category === "done" ? (task.doneAt ?? new Date()) : null,
        })
        .returning({ id: ticket.id });
      const id = created!.id;
      if (labelIds.length) await tx.insert(ticketLabel).values(labelIds.map((labelId) => ({ ticketId: id, labelId, projectId })));
      if (fields.checklist.length) {
        await tx.insert(subtask).values(fields.checklist.map((c, i) => ({ workspaceId: this.ws, ticketId: id, title: c.title, done: c.done, sort: initialSortKey(i) })));
      }
      await tx.insert(activity).values({ workspaceId: this.ws, ticketId: id, actorId: this.actorId, type: "imported", payload: { source: this.sourceName, ref: task.ref }, via: "api" });
      await tx.insert(externalRef).values({ workspaceId: this.ws, integrationId: this.integ.id, entityType: "task", externalId: task.id, localId: id, ...refPatch });
    });
    this.tops.set(projectId, sort);
    return "created";
  }

  /**
   * Brings parent links in line with the source (see desiredParents). First detaches what moved,
   * then attaches – so a ticket never has to become a subtask while it still has subtasks. Parents
   * set by hand on tickets the source has no parent for (e.g. under a local epic) stay.
   * Returns how many tickets could not be placed (hierarchy rules, e.g. the parent was made an epic).
   */
  async linkHierarchy(): Promise<number> {
    const rows = await db
      .select({ externalId: externalRef.externalId, externalParentId: externalRef.externalParentId, localId: externalRef.localId, projectId: ticket.projectId, type: ticket.type, parentId: ticket.parentId })
      .from(externalRef)
      .innerJoin(ticket, and(eq(ticket.id, externalRef.localId), eq(ticket.workspaceId, externalRef.workspaceId)))
      .where(and(eq(externalRef.integrationId, this.integ.id), eq(externalRef.workspaceId, this.ws), eq(externalRef.entityType, "task")));
    const desired = desiredParents(rows);
    const synced = new Set(rows.map((r) => r.localId));
    let unplaced = 0;
    const where = (id: string) => and(eq(ticket.id, id), eq(ticket.workspaceId, this.ws));

    for (const r of rows) {
      const want = desired.get(r.localId) ?? null;
      if (!r.parentId || r.parentId === want || (!want && !synced.has(r.parentId))) continue;
      try {
        await db.update(ticket).set({ parentId: null, type: r.type === "subtask" ? "task" : r.type }).where(where(r.localId));
        r.parentId = null;
        if (r.type === "subtask") r.type = "task";
      } catch (e) {
        unplaced++;
        console.warn("integration sync: detach failed", { integrationId: this.integ.id, code: errorCode(e) });
      }
    }
    for (const r of rows) {
      const want = desired.get(r.localId) ?? null;
      if (!want || r.parentId === want) continue;
      try {
        await db.update(ticket).set({ parentId: want, type: "subtask" }).where(where(r.localId));
      } catch (e) {
        unplaced++;
        console.warn("integration sync: link failed", { integrationId: this.integ.id, code: errorCode(e) });
      }
    }
    return unplaced;
  }

  /** Tasks whose comments are still to be fetched (second phase). */
  async pendingCommentTasks(limit: number): Promise<Array<{ refId: string; externalId: string; ticketId: string }>> {
    const rows = await db
      .select({ refId: externalRef.id, externalId: externalRef.externalId, ticketId: externalRef.localId })
      .from(externalRef)
      .where(and(eq(externalRef.integrationId, this.integ.id), eq(externalRef.workspaceId, this.ws), eq(externalRef.entityType, "task"), eq(externalRef.pendingDetail, true)))
      .limit(limit);
    return rows;
  }

  /** Adds comments not seen before (idempotent via external_ref) and clears the task's pending flag. */
  async saveComments(task: { refId: string; ticketId: string }, comments: ExternalComment[]): Promise<number> {
    const [exists] = await db.select({ id: ticket.id }).from(ticket).where(and(eq(ticket.id, task.ticketId), eq(ticket.workspaceId, this.ws))).limit(1);
    const withText = comments.filter((c) => c.body);
    let added = 0;
    if (exists && withText.length) {
      const known = new Set(
        (
          await db
            .select({ externalId: externalRef.externalId })
            .from(externalRef)
            .where(and(eq(externalRef.integrationId, this.integ.id), eq(externalRef.entityType, "comment"), inArray(externalRef.externalId, withText.map((c) => c.id))))
        ).map((r) => r.externalId),
      );
      const fresh = withText.filter((c) => !known.has(c.id)).sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));
      if (fresh.length) {
        await db.transaction(async (tx) => {
          for (const c of fresh) {
            const authorId = this.member(c.author?.id);
            const by = !authorId && c.author ? ` – ${c.author.name}` : "";
            const body = cutText(`_Aus ${this.sourceName} übernommen${by}_\n\n${c.body}`, MAX_COMMENT);
            const [row] = await tx
              .insert(comment)
              .values({ workspaceId: this.ws, ticketId: task.ticketId, authorId: authorId ?? this.actorId, body, createdAt: c.createdAt ?? undefined })
              .returning({ id: comment.id });
            await tx.insert(externalRef).values({ workspaceId: this.ws, integrationId: this.integ.id, entityType: "comment", externalId: c.id, localId: row!.id, externalUpdatedAt: c.createdAt });
          }
        });
        added = fresh.length;
      }
    }
    await db.update(externalRef).set({ pendingDetail: false }).where(and(eq(externalRef.id, task.refId), eq(externalRef.workspaceId, this.ws)));
    return added;
  }
}

function cutText(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}

/** Postgres/driver error → short code for logs (never values or row contents). */
export function errorCode(e: unknown): string {
  if (e && typeof e === "object") {
    const o = e as { code?: unknown; constraint_name?: unknown; message?: unknown; cause?: unknown };
    const hierarchy = /ticket_hierarchy:\w+/.exec(`${String(o.message ?? "")} ${String((o.cause as { message?: unknown } | undefined)?.message ?? "")}`)?.[0];
    if (hierarchy) return hierarchy;
    if (typeof o.code === "string") return `${o.code}${typeof o.constraint_name === "string" ? `:${o.constraint_name}` : ""}`;
    if (o.cause) return errorCode(o.cause);
    if (e instanceof Error) return e.message.slice(0, 80);
  }
  return "unknown";
}
