import "server-only";
import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { project, status, ticket } from "@/db/schema";
import type { Tx } from "@/db/queries/workspaces";
import { DEFAULT_STATUSES } from "@/lib/project-templates";
import { initialSortKey } from "@/lib/sort-key";

/** Creates a project with the default statuses. Returns the project and its "open" status. */
export async function createProjectWithDefaults(
  tx: Tx,
  input: { workspaceId: string; name: string; key: string; color: string; icon?: string; folderId?: string | null; sort?: string },
) {
  const [created] = await tx
    .insert(project)
    .values({
      workspaceId: input.workspaceId,
      name: input.name,
      key: input.key,
      color: input.color,
      icon: input.icon,
      folderId: input.folderId ?? null,
      sort: input.sort ?? initialSortKey(0),
    })
    .returning();
  const statuses = await tx
    .insert(status)
    .values(
      DEFAULT_STATUSES.map((s, i) => ({
        workspaceId: input.workspaceId,
        projectId: created!.id,
        name: s.name,
        color: s.color,
        category: s.category,
        sort: initialSortKey(i),
      })),
    )
    .returning();
  return { project: created!, openStatus: statuses.find((s) => s.category === "open")! };
}

/** Atomically reserves the next ticket number of a project. */
export async function nextTicketNumber(tx: Tx, projectId: string): Promise<number> {
  const [row] = await tx
    .update(project)
    .set({ ticketSeq: sql`${project.ticketSeq} + 1` })
    .where(eq(project.id, projectId))
    .returning({ seq: project.ticketSeq });
  return row!.seq;
}

export async function createTickets(
  tx: Tx,
  input: { workspaceId: string; projectId: string; statusId: string; createdBy: string; tickets: Array<{ title: string; priority: number }> },
) {
  for (const [i, t] of input.tickets.entries()) {
    const number = await nextTicketNumber(tx, input.projectId);
    await tx.insert(ticket).values({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      number,
      title: t.title,
      priority: t.priority,
      statusId: input.statusId,
      sort: initialSortKey(i),
      createdBy: input.createdBy,
    });
  }
}

/** Active projects of a workspace with their tickets (overview until the list view exists). */
export async function listProjectsWithTickets(workspaceId: string) {
  const projects = await db
    .select({ id: project.id, name: project.name, key: project.key, color: project.color, icon: project.icon })
    .from(project)
    .where(and(eq(project.workspaceId, workspaceId), isNull(project.archivedAt)))
    .orderBy(project.sort);
  const tickets = await db
    .select({ id: ticket.id, projectId: ticket.projectId, number: ticket.number, title: ticket.title })
    .from(ticket)
    .where(eq(ticket.workspaceId, workspaceId))
    .orderBy(ticket.projectId, ticket.sort);
  return projects.map((p) => ({ ...p, tickets: tickets.filter((t) => t.projectId === p.id) }));
}

export type ProjectRow = typeof project.$inferSelect;

export async function findProjectByKey(workspaceId: string, key: string) {
  const [row] = await db
    .select()
    .from(project)
    .where(and(eq(project.workspaceId, workspaceId), eq(project.key, key.toUpperCase())))
    .limit(1);
  return row ?? null;
}

export async function projectKeyTaken(workspaceId: string, key: string) {
  const [row] = await db
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.workspaceId, workspaceId), eq(project.key, key)))
    .limit(1);
  return Boolean(row);
}

export async function updateProject(
  workspaceId: string,
  projectId: string,
  patch: Partial<Pick<ProjectRow, "name" | "color" | "icon" | "folderId" | "sort" | "archivedAt">>,
) {
  await db.update(project).set(patch).where(and(eq(project.id, projectId), eq(project.workspaceId, workspaceId)));
}

export async function listArchivedProjects(workspaceId: string) {
  return db
    .select({ id: project.id, name: project.name, key: project.key, color: project.color, archivedAt: project.archivedAt })
    .from(project)
    .where(and(eq(project.workspaceId, workspaceId), sql`${project.archivedAt} is not null`))
    .orderBy(asc(project.name));
}

/** Statuses of a project with their ticket counts. */
export async function listStatuses(workspaceId: string, projectId: string) {
  return db
    .select({
      id: status.id,
      name: status.name,
      color: status.color,
      category: status.category,
      sort: status.sort,
      wipLimit: status.wipLimit,
      ticketCount: sql<number>`(select count(*) from ${ticket} where ${ticket.statusId} = ${status.id})`.mapWith(Number),
    })
    .from(status)
    .where(and(eq(status.workspaceId, workspaceId), eq(status.projectId, projectId)))
    .orderBy(asc(status.sort));
}

export type StatusCategory = (typeof status.$inferSelect)["category"];

export async function createStatus(
  workspaceId: string,
  projectId: string,
  input: { name: string; color: string; category: StatusCategory; sort: string },
) {
  await db.insert(status).values({ workspaceId, projectId, ...input });
}

export async function updateStatus(
  workspaceId: string,
  statusId: string,
  patch: Partial<{ name: string; color: string; category: StatusCategory; sort: string }>,
) {
  await db.update(status).set(patch).where(and(eq(status.id, statusId), eq(status.workspaceId, workspaceId)));
}

/** Deletes a status after moving its tickets to `targetStatusId` (same project, same workspace). */
export async function deleteStatus(workspaceId: string, projectId: string, statusId: string, targetStatusId: string | null) {
  await db.transaction(async (tx) => {
    const [{ n } = { n: 0 }] = await tx
      .select({ n: count() })
      .from(ticket)
      .where(and(eq(ticket.statusId, statusId), eq(ticket.workspaceId, workspaceId)));
    if (n > 0) {
      if (!targetStatusId || targetStatusId === statusId) throw new Error("status_has_tickets");
      await tx
        .update(ticket)
        .set({ statusId: targetStatusId })
        .where(and(eq(ticket.statusId, statusId), eq(ticket.workspaceId, workspaceId), eq(ticket.projectId, projectId)));
    }
    await tx.delete(status).where(and(eq(status.id, statusId), eq(status.workspaceId, workspaceId), eq(status.projectId, projectId)));
  });
}

/** Tickets of a project for the placeholder list (full list view: Sprint 3). */
export async function listProjectTickets(workspaceId: string, projectId: string) {
  return db
    .select({
      id: ticket.id,
      number: ticket.number,
      title: ticket.title,
      priority: ticket.priority,
      statusName: status.name,
      statusCategory: status.category,
    })
    .from(ticket)
    .innerJoin(status, eq(status.id, ticket.statusId))
    .where(and(eq(ticket.workspaceId, workspaceId), eq(ticket.projectId, projectId)))
    .orderBy(asc(status.sort), asc(ticket.sort));
}
