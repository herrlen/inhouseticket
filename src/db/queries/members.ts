import "server-only";
import { and, asc, eq, gt, isNull, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { invitation, membership, user, workspace } from "@/db/schema";
import type { Role } from "@/db/queries/workspaces";

export async function listMembers(workspaceId: string) {
  return db
    .select({
      membershipId: membership.id,
      userId: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      role: membership.role,
      joinedAt: membership.createdAt,
    })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.userId))
    .where(and(eq(membership.workspaceId, workspaceId), eq(membership.status, "active")))
    .orderBy(asc(user.name));
}

export async function listPendingInvitations(workspaceId: string) {
  return db
    .select({ id: invitation.id, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt })
    .from(invitation)
    .where(and(eq(invitation.workspaceId, workspaceId), isNull(invitation.acceptedAt), gt(invitation.expiresAt, new Date())))
    .orderBy(asc(invitation.email));
}

/** Membership row inside this workspace (never across workspaces). */
export async function findMemberInWorkspace(workspaceId: string, membershipId: string) {
  const [row] = await db
    .select({ id: membership.id, userId: membership.userId, role: membership.role })
    .from(membership)
    .where(and(eq(membership.id, membershipId), eq(membership.workspaceId, workspaceId), eq(membership.status, "active")))
    .limit(1);
  return row ?? null;
}

export async function setMemberRole(workspaceId: string, membershipId: string, role: Exclude<Role, "owner">) {
  await db
    .update(membership)
    .set({ role })
    .where(and(eq(membership.id, membershipId), eq(membership.workspaceId, workspaceId), ne(membership.role, "owner")));
}

/** Members are disabled, not deleted – their tickets and comments stay attributed. */
export async function disableMember(workspaceId: string, membershipId: string) {
  await db
    .update(membership)
    .set({ status: "disabled" })
    .where(and(eq(membership.id, membershipId), eq(membership.workspaceId, workspaceId), ne(membership.role, "owner")));
}

export async function revokeInvitation(workspaceId: string, invitationId: string) {
  await db
    .delete(invitation)
    .where(and(eq(invitation.id, invitationId), eq(invitation.workspaceId, workspaceId), isNull(invitation.acceptedAt)));
}

export async function setAutoJoin(workspaceId: string, autoJoin: boolean) {
  await db.update(workspace).set({ autoJoin }).where(eq(workspace.id, workspaceId));
}
