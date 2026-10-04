import "server-only";
import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { notification, project, ticket, user, userPref } from "@/db/schema";
import { DEFAULT_PREFS } from "@/db/queries/explorer";

export type NotificationRow = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
  actorName: string | null;
  ticketKey: string | null;
  ticketTitle: string | null;
  projectKey: string | null;
};

export async function listNotifications(workspaceId: string, userId: string, limit = 100): Promise<NotificationRow[]> {
  const rows = await db
    .select({
      id: notification.id,
      type: notification.type,
      payload: notification.payload,
      createdAt: notification.createdAt,
      readAt: notification.readAt,
      actorName: user.name,
      number: ticket.number,
      ticketTitle: ticket.title,
      projectKey: project.key,
    })
    .from(notification)
    .leftJoin(user, eq(user.id, notification.actorId))
    .leftJoin(ticket, eq(ticket.id, notification.ticketId))
    .leftJoin(project, eq(project.id, ticket.projectId))
    .where(and(eq(notification.workspaceId, workspaceId), eq(notification.userId, userId)))
    .orderBy(sql`${notification.readAt} is not null`, desc(notification.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    payload: (r.payload ?? {}) as Record<string, unknown>,
    createdAt: r.createdAt.toISOString(),
    readAt: r.readAt ? r.readAt.toISOString() : null,
    actorName: r.actorName,
    ticketKey: r.projectKey && r.number ? `${r.projectKey}-${r.number}` : null,
    ticketTitle: r.ticketTitle,
    projectKey: r.projectKey,
  }));
}

export async function unreadCount(workspaceId: string, userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(notification)
    .where(and(eq(notification.workspaceId, workspaceId), eq(notification.userId, userId), isNull(notification.readAt)));
  return row?.n ?? 0;
}

/** Marks the given (or all) notifications of this user in this workspace as read. */
export async function markRead(workspaceId: string, userId: string, ids?: string[]) {
  await db
    .update(notification)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notification.workspaceId, workspaceId),
        eq(notification.userId, userId),
        isNull(notification.readAt),
        ids ? inArray(notification.id, ids) : undefined,
      ),
    );
}

export async function setEmailDigest(workspaceId: string, userId: string, on: boolean) {
  await db
    .insert(userPref)
    .values({ workspaceId, userId, ...DEFAULT_PREFS, emailDigest: on })
    .onConflictDoUpdate({ target: [userPref.userId, userPref.workspaceId], set: { emailDigest: on } });
}

export async function getEmailDigest(workspaceId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ on: userPref.emailDigest })
    .from(userPref)
    .where(and(eq(userPref.workspaceId, workspaceId), eq(userPref.userId, userId)))
    .limit(1);
  return row?.on ?? true;
}
