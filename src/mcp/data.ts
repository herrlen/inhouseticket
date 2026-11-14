import "server-only";
import { and, asc, count, desc, eq, ilike, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { comment, label, membership, project, status, subtask, ticket, ticketLabel, user } from "@/db/schema";
import type { TicketType } from "@/lib/ticket-hierarchy";
import { timestampToDueDate } from "@/lib/validation/ticket";

// Workspace-scoped lookups for the MCP tools. Inputs are human terms (keys, names, status names);
// every miss explains what *would* be valid, so the model can correct itself.

export class ToolInputError extends Error {}

export const PRIORITY_NAMES = ["keine", "niedrig", "mittel", "hoch", "dringend"] as const;
const PRIORITY_ALIASES: Record<string, number> = {
  keine: 0, none: 0, niedrig: 1, low: 1, mittel: 2, medium: 2, hoch: 3, high: 3, dringend: 4, urgent: 4,
};

export function parsePriority(value: string | number): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 4) return value;
  const p = PRIORITY_ALIASES[String(value).trim().toLowerCase()];
  if (p === undefined) throw new ToolInputError(`Unbekannte Priorität "${value}". Erlaubt: ${PRIORITY_NAMES.join(", ")} (oder 0–4).`);
  return p;
}

const parentTicket = alias(ticket, "parent_ticket");

const KEY = /^([A-Za-z][A-Za-z0-9]{1,9})-(\d{1,9})$/;

export async function findTicketByKey(workspaceId: string, key: string) {
  const m = key.trim().match(KEY);
  if (!m) throw new ToolInputError(`"${key}" ist kein Ticket-Key. Format: PROJEKT-NUMMER, z. B. MKT-12.`);
  const [row] = await db
    .select({ id: ticket.id, projectId: ticket.projectId, projectKey: project.key })
    .from(ticket)
    .innerJoin(project, eq(project.id, ticket.projectId))
    .where(and(eq(ticket.workspaceId, workspaceId), eq(project.key, m[1]!.toUpperCase()), eq(ticket.number, Number(m[2])), isNull(project.archivedAt)))
    .limit(1);
  if (!row) throw new ToolInputError(`Ticket ${key.toUpperCase()} gibt es nicht. Mit inhouseticket_search_tickets lassen sich Tickets finden.`);
  return row;
}

/**
 * Parent ticket for create/update: a number in the project ("12") or a full key ("MKT-12", must be
 * the same project). null removes the parent.
 */
export async function resolveParent(workspaceId: string, projectId: string, projectKey: string, value: number | string | null): Promise<string | null> {
  if (value === null) return null;
  const raw = String(value).trim();
  const m = raw.match(/^(?:([A-Za-z][A-Za-z0-9]{1,9})-)?(\d{1,9})$/);
  if (!m) throw new ToolInputError(`"${raw}" ist keine Ticketnummer. Format: 12 oder ${projectKey}-12.`);
  if (m[1] && m[1].toUpperCase() !== projectKey) throw new ToolInputError(`Das übergeordnete Ticket muss im selben Projekt (${projectKey}) liegen.`);
  const [row] = await db
    .select({ id: ticket.id })
    .from(ticket)
    .where(and(eq(ticket.workspaceId, workspaceId), eq(ticket.projectId, projectId), eq(ticket.number, Number(m[2]))))
    .limit(1);
  if (!row) throw new ToolInputError(`Ticket ${projectKey}-${m[2]} gibt es nicht.`);
  return row.id;
}

export async function findProject(workspaceId: string, key: string) {
  const [p] = await db
    .select({ id: project.id, key: project.key, name: project.name })
    .from(project)
    .where(and(eq(project.workspaceId, workspaceId), eq(project.key, key.trim().toUpperCase()), isNull(project.archivedAt)))
    .limit(1);
  if (p) return p;
  const all = await db.select({ key: project.key }).from(project).where(and(eq(project.workspaceId, workspaceId), isNull(project.archivedAt)));
  throw new ToolInputError(`Projekt "${key}" gibt es nicht. Vorhanden: ${all.map((x) => x.key).join(", ") || "keine Projekte"}.`);
}

export async function resolveStatus(workspaceId: string, projectId: string, name: string) {
  const all = await db
    .select({ id: status.id, name: status.name, category: status.category })
    .from(status)
    .where(and(eq(status.workspaceId, workspaceId), eq(status.projectId, projectId)))
    .orderBy(asc(status.sort));
  const hit = all.find((s) => s.name.toLowerCase() === name.trim().toLowerCase());
  if (!hit) throw new ToolInputError(`Status "${name}" gibt es in diesem Projekt nicht. Erlaubt: ${all.map((s) => s.name).join(", ")}.`);
  return hit;
}

/** "me", an e-mail or a (unique) name/first name → user id among active members. */
export async function resolveMember(workspaceId: string, value: string, actorId: string): Promise<string> {
  const v = value.trim().toLowerCase();
  if (v === "me" || v === "ich") return actorId;
  const members = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.userId))
    .where(and(eq(membership.workspaceId, workspaceId), eq(membership.status, "active")));
  const exact = members.filter((m) => m.email.toLowerCase() === v || m.name.toLowerCase() === v);
  const first = members.filter((m) => m.name.toLowerCase().split(/\s+/)[0] === v);
  const hits = exact.length ? exact : first;
  if (hits.length === 1) return hits[0]!.id;
  const list = members.map((m) => `${m.name} <${m.email}>`).join("; ");
  throw new ToolInputError(hits.length > 1 ? `"${value}" ist mehrdeutig. Bitte E-Mail angeben. Mitglieder: ${list}` : `Kein Mitglied "${value}". Mitglieder: ${list}`);
}

export type SearchFilters = {
  query?: string;
  projectId?: string;
  statusName?: string;
  priority?: number;
  assigneeId?: string | null;
  dueBefore?: string;
  includeDone?: boolean;
  type?: TicketType;
  limit: number;
  offset: number;
};

export async function searchForTool(workspaceId: string, f: SearchFilters) {
  const where: SQL[] = [eq(ticket.workspaceId, workspaceId), isNull(project.archivedAt)];
  if (f.projectId) where.push(eq(ticket.projectId, f.projectId));
  if (f.statusName) where.push(sql`lower(${status.name}) = ${f.statusName.toLowerCase()}`);
  if (!f.includeDone && !f.statusName) where.push(sql`${status.category} <> 'done'`);
  if (f.priority !== undefined) where.push(eq(ticket.priority, f.priority));
  if (f.type) where.push(eq(ticket.type, f.type));
  if (f.assigneeId === null) where.push(isNull(ticket.assigneeId));
  else if (f.assigneeId) where.push(eq(ticket.assigneeId, f.assigneeId));
  if (f.dueBefore) where.push(lte(ticket.dueAt, new Date(`${f.dueBefore}T00:00:00Z`)));
  if (f.query) {
    const like = `%${f.query.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    where.push(or(ilike(ticket.title, like), ilike(ticket.description, like))!);
  }
  const base = db
    .select({
      id: ticket.id,
      number: ticket.number,
      type: ticket.type,
      parentNumber: parentTicket.number,
      title: ticket.title,
      priority: ticket.priority,
      dueAt: ticket.dueAt,
      projectKey: project.key,
      statusName: status.name,
      assigneeName: user.name,
    })
    .from(ticket)
    .innerJoin(project, eq(project.id, ticket.projectId))
    .innerJoin(status, eq(status.id, ticket.statusId))
    .leftJoin(user, eq(user.id, ticket.assigneeId))
    .leftJoin(parentTicket, and(eq(parentTicket.id, ticket.parentId), eq(parentTicket.workspaceId, workspaceId)))
    .where(and(...where));
  const [rows, [{ n } = { n: 0 }]] = await Promise.all([
    base.orderBy(sql`${ticket.dueAt} asc nulls last`, desc(ticket.priority), desc(ticket.updatedAt)).limit(f.limit).offset(f.offset),
    db
      .select({ n: count() })
      .from(ticket)
      .innerJoin(project, eq(project.id, ticket.projectId))
      .innerJoin(status, eq(status.id, ticket.statusId))
      .where(and(...where)),
  ]);
  return {
    total: n,
    tickets: rows.map((r) => ({
      key: `${r.projectKey}-${r.number}`,
      type: r.type,
      parent_number: r.parentNumber,
      title: r.title,
      status: r.statusName,
      priority: PRIORITY_NAMES[r.priority] ?? "keine",
      assignee: r.assigneeName,
      due_date: timestampToDueDate(r.dueAt),
    })),
  };
}

export async function ticketDetail(workspaceId: string, ticketId: string) {
  const [t] = await db
    .select({
      id: ticket.id,
      number: ticket.number,
      type: ticket.type,
      parentId: ticket.parentId,
      projectId: ticket.projectId,
      title: ticket.title,
      description: ticket.description,
      priority: ticket.priority,
      dueAt: ticket.dueAt,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      projectKey: project.key,
      projectName: project.name,
      statusName: status.name,
      assigneeName: user.name,
    })
    .from(ticket)
    .innerJoin(project, eq(project.id, ticket.projectId))
    .innerJoin(status, eq(status.id, ticket.statusId))
    .leftJoin(user, eq(user.id, ticket.assigneeId))
    .where(and(eq(ticket.workspaceId, workspaceId), eq(ticket.id, ticketId)))
    .limit(1);
  if (!t) throw new ToolInputError("Ticket nicht gefunden.");
  const [labels, subtasks, comments, parent, children] = await Promise.all([
    db.select({ name: label.name }).from(ticketLabel).innerJoin(label, eq(label.id, ticketLabel.labelId)).where(eq(ticketLabel.ticketId, ticketId)),
    db.select({ title: subtask.title, done: subtask.done }).from(subtask).where(and(eq(subtask.ticketId, ticketId), eq(subtask.workspaceId, workspaceId))).orderBy(asc(subtask.sort)),
    db
      .select({ author: user.name, body: comment.body, createdAt: comment.createdAt })
      .from(comment)
      .innerJoin(user, eq(user.id, comment.authorId))
      .where(and(eq(comment.ticketId, ticketId), eq(comment.workspaceId, workspaceId)))
      .orderBy(desc(comment.createdAt))
      .limit(20),
    t.parentId
      ? db.select({ number: ticket.number, title: ticket.title, type: ticket.type }).from(ticket).where(and(eq(ticket.id, t.parentId), eq(ticket.workspaceId, workspaceId))).limit(1)
      : Promise.resolve([]),
    db
      .select({ number: ticket.number, title: ticket.title, type: ticket.type, statusName: status.name, done: sql<boolean>`${status.category} = 'done'`, assigneeName: user.name })
      .from(ticket)
      .innerJoin(status, eq(status.id, ticket.statusId))
      .leftJoin(user, eq(user.id, ticket.assigneeId))
      .where(and(eq(ticket.parentId, ticketId), eq(ticket.workspaceId, workspaceId)))
      .orderBy(asc(ticket.number)),
  ]);
  const up = parent[0];
  return {
    key: `${t.projectKey}-${t.number}`,
    type: t.type,
    parent_number: up?.number ?? null,
    parent: up ? { key: `${t.projectKey}-${up.number}`, title: up.title, type: up.type } : null,
    children: children.map((c) => ({ key: `${t.projectKey}-${c.number}`, number: c.number, type: c.type, title: c.title, status: c.statusName, done: c.done, assignee: c.assigneeName })),
    title: t.title,
    project: `${t.projectName} (${t.projectKey})`,
    status: t.statusName,
    priority: PRIORITY_NAMES[t.priority] ?? "keine",
    assignee: t.assigneeName,
    due_date: timestampToDueDate(t.dueAt),
    labels: labels.map((l) => l.name),
    description: t.description,
    subtasks: subtasks.map((s, i) => ({ index: i + 1, title: s.title, done: s.done })),
    comments: comments.reverse().map((c) => ({ author: c.author, created_at: c.createdAt.toISOString(), body: c.body })),
    created_at: t.createdAt.toISOString(),
    updated_at: t.updatedAt.toISOString(),
  };
}

export async function listMembersForTool(workspaceId: string) {
  return db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.userId))
    .where(and(eq(membership.workspaceId, workspaceId), eq(membership.status, "active")))
    .orderBy(asc(user.name));
}
