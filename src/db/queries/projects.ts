import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { project, status, ticket } from "@/db/schema";
import type { Tx } from "@/db/queries/workspaces";
import { DEFAULT_STATUSES } from "@/lib/project-templates";
import { initialSortKey } from "@/lib/sort-key";

/** Creates a project with the default statuses. Returns the project and its "open" status. */
export async function createProjectWithDefaults(
  tx: Tx,
  input: { workspaceId: string; name: string; key: string; color: string; icon?: string; sortIndex?: number },
) {
  const [created] = await tx
    .insert(project)
    .values({
      workspaceId: input.workspaceId,
      name: input.name,
      key: input.key,
      color: input.color,
      icon: input.icon,
      sort: initialSortKey(input.sortIndex ?? 0),
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
