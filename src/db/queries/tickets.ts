import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { activity, label, membership, project, status, ticket, ticketLabel, user } from "@/db/schema";
import type { Tx } from "@/db/queries/workspaces";
import { nextTicketNumber } from "@/db/queries/projects";
import { keyBetween } from "@/lib/fractional";
import { dueDateToTimestamp, timestampToDueDate, type TicketPatch } from "@/lib/validation/ticket";

/** Serializable ticket as the client sees it. */
export type TicketRow = {
  id: string;
  projectId: string;
  number: number;
  title: string;
  description: string | null;
  statusId: string;
  priority: number;
  assigneeId: string | null;
  dueDate: string | null;
  sort: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  labelIds: string[];
  subtaskTotal: number;
  subtaskDone: number;
  commentCount: number;
  attachmentCount: number;
};

export type Actor = { userId: string; workspaceId: string; via?: "web" | "mcp" | "api" };

export class TicketError extends Error {
  constructor(public readonly code: "not_found" | "invalid_status" | "invalid_assignee" | "invalid_label" | "project_archived") {
    super(code);
  }
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function selectTickets(executor: Tx | typeof db) {
  return executor
    .select({
      id: ticket.id,
      projectId: ticket.projectId,
      number: ticket.number,
      title: ticket.title,
      description: ticket.description,
      statusId: ticket.statusId,
      priority: ticket.priority,
      assigneeId: ticket.assigneeId,
      dueAt: ticket.dueAt,
      sort: ticket.sort,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      completedAt: ticket.completedAt,
      labelIds: sql<string[]>`coalesce(array_agg(${ticketLabel.labelId}) filter (where ${ticketLabel.labelId} is not null), '{}')`,
      // Fully qualified on purpose: drizzle renders bare column names inside sql`` (see Sprint 2 fix).
      subtaskTotal: sql<number>`(select count(*) from "subtask" s where s."ticket_id" = "ticket"."id")`.mapWith(Number),
      subtaskDone: sql<number>`(select count(*) from "subtask" s where s."ticket_id" = "ticket"."id" and s."done")`.mapWith(Number),
      commentCount: sql<number>`(select count(*) from "comment" c where c."ticket_id" = "ticket"."id")`.mapWith(Number),
      attachmentCount: sql<number>`(select count(*) from "attachment" a where a."ticket_id" = "ticket"."id")`.mapWith(Number),
    })
    .from(ticket)
    .leftJoin(ticketLabel, eq(ticketLabel.ticketId, ticket.id))
    .groupBy(ticket.id)
    .$dynamic();
}

function toRow(r: Awaited<ReturnType<ReturnType<typeof selectTickets>["execute"]>>[number]): TicketRow {
  return {
    id: r.id,
    projectId: r.projectId,
    number: r.number,
    title: r.title,
    description: r.description,
    statusId: r.statusId,
    priority: r.priority,
    assigneeId: r.assigneeId,
    dueDate: timestampToDueDate(r.dueAt),
    sort: r.sort,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    completedAt: iso(r.completedAt),
    labelIds: r.labelIds,
    subtaskTotal: r.subtaskTotal,
    subtaskDone: r.subtaskDone,
    commentCount: r.commentCount,
    attachmentCount: r.attachmentCount,
  };
}

export async function listTickets(workspaceId: string, projectId: string): Promise<TicketRow[]> {
  const rows = await selectTickets(db)
    .where(and(eq(ticket.workspaceId, workspaceId), eq(ticket.projectId, projectId)))
    .orderBy(asc(ticket.sort));
  return rows.map(toRow);
}

async function loadTicket(executor: Tx | typeof db, workspaceId: string, ticketId: string): Promise<TicketRow | null> {
  const [row] = await selectTickets(executor).where(and(eq(ticket.workspaceId, workspaceId), eq(ticket.id, ticketId)));
  return row ? toRow(row) : null;
}

export async function getTicket(workspaceId: string, ticketId: string) {
  return loadTicket(db, workspaceId, ticketId);
}

// ---------------------------------------------------------------------------
// Lookups used for validation (always inside the workspace)
// ---------------------------------------------------------------------------

async function statusOf(tx: Tx, workspaceId: string, projectId: string, statusId: string) {
  const [s] = await tx
    .select({ id: status.id, name: status.name, category: status.category })
    .from(status)
    .where(and(eq(status.id, statusId), eq(status.projectId, projectId), eq(status.workspaceId, workspaceId)))
    .limit(1);
  return s ?? null;
}

async function assertAssignee(tx: Tx, workspaceId: string, userId: string | null | undefined) {
  if (!userId) return null;
  const [m] = await tx
    .select({ name: user.name })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.userId))
    .where(and(eq(membership.workspaceId, workspaceId), eq(membership.userId, userId), eq(membership.status, "active")))
    .limit(1);
  if (!m) throw new TicketError("invalid_assignee");
  return m.name;
}

async function userName(tx: Tx, userId: string | null) {
  if (!userId) return null;
  const [u] = await tx.select({ name: user.name }).from(user).where(eq(user.id, userId)).limit(1);
  return u?.name ?? null;
}

async function log(tx: Tx, actor: Actor, ticketId: string, type: string, payload: Record<string, unknown> = {}) {
  await tx.insert(activity).values({ workspaceId: actor.workspaceId, ticketId, actorId: actor.userId, type, payload, via: actor.via ?? "web" });
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createTicket(
  actor: Actor,
  input: { projectId: string; title: string; statusId?: string; priority?: number; assigneeId?: string | null; dueDate?: string | null },
): Promise<TicketRow> {
  return db.transaction(async (tx) => {
    const [p] = await tx
      .select({ id: project.id, archivedAt: project.archivedAt })
      .from(project)
      .where(and(eq(project.id, input.projectId), eq(project.workspaceId, actor.workspaceId)))
      .limit(1);
    if (!p) throw new TicketError("not_found");
    if (p.archivedAt) throw new TicketError("project_archived");

    let statusRow = input.statusId ? await statusOf(tx, actor.workspaceId, p.id, input.statusId) : null;
    if (input.statusId && !statusRow) throw new TicketError("invalid_status");
    if (!statusRow) {
      // Default: first "open" status, else the first status of the project.
      const [first] = await tx
        .select({ id: status.id, name: status.name, category: status.category })
        .from(status)
        .where(and(eq(status.projectId, p.id), eq(status.workspaceId, actor.workspaceId)))
        .orderBy(sql`case when ${status.category} = 'open' then 0 else 1 end`, asc(status.sort))
        .limit(1);
      if (!first) throw new TicketError("invalid_status");
      statusRow = first;
    }
    await assertAssignee(tx, actor.workspaceId, input.assigneeId);

    // New tickets go to the top of the manual order.
    const [top] = await tx
      .select({ sort: ticket.sort })
      .from(ticket)
      .where(and(eq(ticket.projectId, p.id), eq(ticket.workspaceId, actor.workspaceId)))
      .orderBy(asc(ticket.sort))
      .limit(1);
    const number = await nextTicketNumber(tx, p.id);
    const [created] = await tx
      .insert(ticket)
      .values({
        workspaceId: actor.workspaceId,
        projectId: p.id,
        number,
        title: input.title,
        statusId: statusRow.id,
        priority: input.priority ?? 0,
        assigneeId: input.assigneeId ?? null,
        dueAt: dueDateToTimestamp(input.dueDate ?? null),
        sort: keyBetween(null, top?.sort ?? null),
        createdBy: actor.userId,
        completedAt: statusRow.category === "done" ? new Date() : null,
      })
      .returning({ id: ticket.id });
    await log(tx, actor, created!.id, "created", { number });
    return (await loadTicket(tx, actor.workspaceId, created!.id))!;
  });
}

// ---------------------------------------------------------------------------
// Update (single field set, with activity per changed field)
// ---------------------------------------------------------------------------

export async function updateTicket(actor: Actor, ticketId: string, patch: TicketPatch): Promise<TicketRow> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(ticket)
      .where(and(eq(ticket.id, ticketId), eq(ticket.workspaceId, actor.workspaceId)))
      .for("update")
      .limit(1);
    if (!current) throw new TicketError("not_found");

    const set: Partial<typeof ticket.$inferInsert> = {};

    if (patch.title !== undefined && patch.title !== current.title) {
      set.title = patch.title;
      await log(tx, actor, ticketId, "title", { from: current.title, to: patch.title });
    }
    if (patch.description !== undefined && patch.description !== current.description) {
      set.description = patch.description;
      await log(tx, actor, ticketId, "description");
    }
    if (patch.statusId !== undefined && patch.statusId !== current.statusId) {
      const next = await statusOf(tx, actor.workspaceId, current.projectId, patch.statusId);
      if (!next) throw new TicketError("invalid_status");
      const prev = await statusOf(tx, actor.workspaceId, current.projectId, current.statusId);
      set.statusId = next.id;
      if (next.category === "done" && prev?.category !== "done") set.completedAt = new Date();
      if (next.category !== "done") set.completedAt = null;
      await log(tx, actor, ticketId, "status", { from: prev?.name ?? null, to: next.name });
    }
    if (patch.priority !== undefined && patch.priority !== current.priority) {
      set.priority = patch.priority;
      await log(tx, actor, ticketId, "priority", { from: current.priority, to: patch.priority });
    }
    if (patch.assigneeId !== undefined && patch.assigneeId !== current.assigneeId) {
      const toName = await assertAssignee(tx, actor.workspaceId, patch.assigneeId);
      set.assigneeId = patch.assigneeId;
      await log(tx, actor, ticketId, "assignee", { from: await userName(tx, current.assigneeId), to: toName });
    }
    if (patch.dueDate !== undefined && patch.dueDate !== timestampToDueDate(current.dueAt)) {
      set.dueAt = dueDateToTimestamp(patch.dueDate);
      await log(tx, actor, ticketId, "due", { from: timestampToDueDate(current.dueAt), to: patch.dueDate });
    }

    // Reordering is not logged – it is not a change of the ticket's content.
    if (patch.sort !== undefined && patch.sort !== current.sort) set.sort = patch.sort;

    if (Object.keys(set).length > 0) {
      await tx.update(ticket).set(set).where(and(eq(ticket.id, ticketId), eq(ticket.workspaceId, actor.workspaceId)));
    }

    if (patch.labelIds !== undefined) {
      const wanted = [...new Set(patch.labelIds)];
      if (wanted.length > 0) {
        const valid = await tx
          .select({ id: label.id })
          .from(label)
          .where(and(inArray(label.id, wanted), eq(label.projectId, current.projectId), eq(label.workspaceId, actor.workspaceId)));
        if (valid.length !== wanted.length) throw new TicketError("invalid_label");
      }
      const existing = (await tx.select({ id: ticketLabel.labelId }).from(ticketLabel).where(eq(ticketLabel.ticketId, ticketId))).map((r) => r.id);
      const added = wanted.filter((id) => !existing.includes(id));
      const removed = existing.filter((id) => !wanted.includes(id));
      if (removed.length > 0) await tx.delete(ticketLabel).where(and(eq(ticketLabel.ticketId, ticketId), inArray(ticketLabel.labelId, removed)));
      if (added.length > 0) await tx.insert(ticketLabel).values(added.map((labelId) => ({ ticketId, labelId, projectId: current.projectId })));
      if (added.length > 0 || removed.length > 0) {
        const names = await tx.select({ id: label.id, name: label.name }).from(label).where(inArray(label.id, [...added, ...removed]));
        const nameOf = (id: string) => names.find((n) => n.id === id)?.name ?? "?";
        await log(tx, actor, ticketId, "labels", { added: added.map(nameOf), removed: removed.map(nameOf) });
      }
      if (Object.keys(set).length === 0) await tx.update(ticket).set({ updatedAt: new Date() }).where(eq(ticket.id, ticketId));
    }

    return (await loadTicket(tx, actor.workspaceId, ticketId))!;
  });
}

// ---------------------------------------------------------------------------
// Activity, labels, members
// ---------------------------------------------------------------------------

export type ActivityRow = { id: string; type: string; payload: Record<string, unknown>; via: string; createdAt: string; actorName: string | null };

export async function listActivity(workspaceId: string, ticketId: string): Promise<ActivityRow[]> {
  const rows = await db
    .select({ id: activity.id, type: activity.type, payload: activity.payload, via: activity.via, createdAt: activity.createdAt, actorName: user.name })
    .from(activity)
    .leftJoin(user, eq(user.id, activity.actorId))
    .where(and(eq(activity.workspaceId, workspaceId), eq(activity.ticketId, ticketId)))
    .orderBy(desc(activity.createdAt))
    .limit(100);
  return rows.map((r) => ({ ...r, payload: (r.payload ?? {}) as Record<string, unknown>, createdAt: r.createdAt.toISOString() }));
}

export type LabelRow = { id: string; name: string; color: string };

export async function listLabels(workspaceId: string, projectId: string): Promise<LabelRow[]> {
  return db
    .select({ id: label.id, name: label.name, color: label.color })
    .from(label)
    .where(and(eq(label.workspaceId, workspaceId), eq(label.projectId, projectId)))
    .orderBy(asc(label.name));
}

export async function createLabel(workspaceId: string, projectId: string, input: { name: string; color: string }): Promise<LabelRow> {
  const [p] = await db
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.workspaceId, workspaceId), isNull(project.archivedAt)))
    .limit(1);
  if (!p) throw new TicketError("not_found");
  const [row] = await db
    .insert(label)
    .values({ workspaceId, projectId, name: input.name, color: input.color })
    .onConflictDoUpdate({ target: [label.projectId, label.name], set: { name: input.name } })
    .returning({ id: label.id, name: label.name, color: label.color });
  return row!;
}

export type MemberOption = { id: string; name: string; image: string | null };

export async function listAssignableMembers(workspaceId: string): Promise<MemberOption[]> {
  return db
    .select({ id: user.id, name: user.name, image: user.image })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.userId))
    .where(and(eq(membership.workspaceId, workspaceId), eq(membership.status, "active")))
    .orderBy(asc(user.name));
}

export type MyTask = {
  id: string;
  key: string;
  title: string;
  priority: number;
  dueDate: string | null;
  statusName: string;
  statusColor: string;
  projectKey: string;
  projectName: string;
  projectColor: string;
};

/** Open tickets assigned to a user across all active projects of the workspace (KONZEPT §2.4). */
export async function listMyTasks(workspaceId: string, userId: string): Promise<MyTask[]> {
  const rows = await db
    .select({
      id: ticket.id,
      number: ticket.number,
      title: ticket.title,
      priority: ticket.priority,
      dueAt: ticket.dueAt,
      statusName: status.name,
      statusColor: status.color,
      projectKey: project.key,
      projectName: project.name,
      projectColor: project.color,
    })
    .from(ticket)
    .innerJoin(status, eq(status.id, ticket.statusId))
    .innerJoin(project, eq(project.id, ticket.projectId))
    .where(
      and(
        eq(ticket.workspaceId, workspaceId),
        eq(ticket.assigneeId, userId),
        sql`${status.category} <> 'done'`,
        isNull(project.archivedAt),
      ),
    )
    .orderBy(sql`${ticket.dueAt} asc nulls last`, desc(ticket.priority), asc(ticket.createdAt));
  return rows.map((r) => ({
    id: r.id,
    key: `${r.projectKey}-${r.number}`,
    title: r.title,
    priority: r.priority,
    dueDate: timestampToDueDate(r.dueAt),
    statusName: r.statusName,
    statusColor: r.statusColor,
    projectKey: r.projectKey,
    projectName: r.projectName,
    projectColor: r.projectColor,
  }));
}
