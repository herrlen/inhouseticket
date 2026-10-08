import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { lastProjectSort } from "@/db/queries/explorer";
import { createProjectWithDefaults, projectKeyTaken } from "@/db/queries/projects";
import { activity, comment, label, membership, project, status, subtask, ticket, ticketLabel, user } from "@/db/schema";
import { keyBetween, keysBetween } from "@/lib/fractional";
import type { ImportPlan, Member } from "@/lib/import/plan";
import { PALETTE } from "@/lib/palette";
import { initialSortKey } from "@/lib/sort-key";
import { dueDateToTimestamp } from "@/lib/validation/ticket";

// Bulk insert size: keeps every statement far below Postgres' 65 535 bind parameters.
const CHUNK = 500;

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

/** Active members, the only people an imported ticket may be assigned to. */
export async function listImportMembers(workspaceId: string): Promise<Member[]> {
  return db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.userId))
    .where(and(eq(membership.workspaceId, workspaceId), eq(membership.status, "active")));
}

export class ImportError extends Error {
  constructor(readonly code: "key_taken") {
    super(code);
  }
}

/**
 * Writes a plan into a new project, all or nothing. Tickets are numbered oldest first and
 * listed newest first, like tickets created by hand. No notifications are sent.
 */
export async function runImport(
  actor: { workspaceId: string; userId: string },
  input: { name: string; key: string; color: string; source: string },
  plan: ImportPlan,
): Promise<{ projectKey: string; tickets: number }> {
  if (await projectKeyTaken(actor.workspaceId, input.key)) throw new ImportError("key_taken");
  const ws = actor.workspaceId;
  const ordered = plan.tickets
    .map((t, i) => ({ t, i }))
    .sort((a, b) => (a.t.createdAt?.getTime() ?? Infinity) - (b.t.createdAt?.getTime() ?? Infinity) || a.i - b.i)
    .map(({ t }) => t);
  const sortKeys = keysBetween(null, null, ordered.length).reverse();

  await db.transaction(async (tx) => {
    const { project: p } = await createProjectWithDefaults(tx, {
      workspaceId: ws,
      name: input.name,
      key: input.key,
      color: input.color,
      sort: keyBetween(await lastProjectSort(ws, null), null),
    });
    await tx.update(project).set({ ticketSeq: ordered.length }).where(eq(project.id, p.id));
    const statusIds = new Map(
      (await tx.select({ id: status.id, name: status.name }).from(status).where(and(eq(status.projectId, p.id), eq(status.workspaceId, ws)))).map((s) => [s.name, s.id]),
    );

    const ticketIds: string[] = [];
    for (const [c, part] of chunks(ordered).entries()) {
      const rows = await tx
        .insert(ticket)
        .values(
          part.map((t, j) => {
            const i = c * CHUNK + j;
            return {
              workspaceId: ws,
              projectId: p.id,
              number: i + 1,
              title: t.title,
              description: t.description,
              statusId: statusIds.get(t.status)!,
              priority: t.priority,
              assigneeId: t.assigneeId,
              dueAt: dueDateToTimestamp(t.dueDate),
              sort: sortKeys[i]!,
              createdBy: actor.userId,
              createdAt: t.createdAt ?? undefined,
              completedAt: t.status === "Erledigt" ? (t.completedAt ?? new Date()) : null,
            };
          }),
        )
        .returning({ id: ticket.id });
      ticketIds.push(...rows.map((r) => r.id));
    }

    // Labels: one per distinct name (case-insensitive), colors cycle through the palette.
    const colors = Object.values(PALETTE);
    const labelIds = new Map<string, string>();
    const names = [...new Map(ordered.flatMap((t) => t.labels).map((l) => [l.toLowerCase(), l])).values()];
    const labelRows = names.map((name, i) => ({ workspaceId: ws, projectId: p.id, name, color: colors[i % colors.length]! }));
    for (const part of chunks(labelRows)) {
      const rows = await tx
        .insert(label)
        .values(part)
        .returning({ id: label.id, name: label.name });
      for (const r of rows) labelIds.set(r.name.toLowerCase(), r.id);
    }

    const links = ordered.flatMap((t, i) => t.labels.map((l) => ({ ticketId: ticketIds[i]!, labelId: labelIds.get(l.toLowerCase())!, projectId: p.id })));
    for (const part of chunks(links)) await tx.insert(ticketLabel).values(part);

    const subs = ordered.flatMap((t, i) => t.subtasks.map((s, k) => ({ workspaceId: ws, ticketId: ticketIds[i]!, title: s.title, done: s.done, sort: initialSortKey(k) })));
    for (const part of chunks(subs)) await tx.insert(subtask).values(part);

    const comments = ordered.flatMap((t, i) =>
      t.comments.map((cm) => ({ workspaceId: ws, ticketId: ticketIds[i]!, authorId: actor.userId, body: cm.body, createdAt: cm.createdAt ?? undefined })),
    );
    for (const part of chunks(comments)) await tx.insert(comment).values(part);

    const log = ordered.map((t, i) => ({
      workspaceId: ws,
      ticketId: ticketIds[i]!,
      actorId: actor.userId,
      type: "imported",
      payload: { source: input.source, ref: t.ref },
    }));
    for (const part of chunks(log)) await tx.insert(activity).values(part);
  });

  return { projectKey: input.key, tickets: ordered.length };
}
