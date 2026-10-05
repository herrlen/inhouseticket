import "server-only";
import { and, asc, eq, gt, isNull, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { apiToken, invitation, membership, user, workspace } from "@/db/schema";
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

/**
 * Members are disabled, not deleted – their tickets and comments stay attributed.
 * Their API tokens for this workspace are revoked so a later rejoin does not revive them.
 */
export async function disableMember(workspaceId: string, membershipId: string) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(membership)
      .set({ status: "disabled" })
      .where(and(eq(membership.id, membershipId), eq(membership.workspaceId, workspaceId), ne(membership.role, "owner")))
      .returning({ userId: membership.userId });
    if (!row) return;
    await tx
      .update(apiToken)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiToken.workspaceId, workspaceId), eq(apiToken.userId, row.userId), isNull(apiToken.revokedAt)));
  });
}

/** Only the owner may revoke an admin invitation (admins manage members only, like canInviteAs). */
export async function revokeInvitation(workspaceId: string, invitationId: string, actorRole: Role) {
  await db
    .delete(invitation)
    .where(
      and(
        eq(invitation.id, invitationId),
        eq(invitation.workspaceId, workspaceId),
        isNull(invitation.acceptedAt),
        actorRole === "owner" ? undefined : ne(invitation.role, "admin"),
      ),
    );
}

export async function setAutoJoin(workspaceId: string, autoJoin: boolean) {
  await db.update(workspace).set({ autoJoin }).where(eq(workspace.id, workspaceId));
}
