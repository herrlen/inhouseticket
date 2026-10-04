import "server-only";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db, type Db } from "@/db/client";
import { invitation, membership, user, workspace } from "@/db/schema";
import { MAX_USERS_PER_WORKSPACE } from "@/lib/limits";
import { uniqueSlug } from "@/lib/slug";

export type Role = (typeof membership.$inferSelect)["role"];
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Active membership of a user in the workspace with this slug, or null. */
export async function findMembershipBySlug(slug: string, userId: string) {
  const [row] = await db
    .select({ workspace, membership })
    .from(membership)
    .innerJoin(workspace, eq(workspace.id, membership.workspaceId))
    .where(and(eq(workspace.slug, slug), eq(membership.userId, userId), eq(membership.status, "active")))
    .limit(1);
  return row ?? null;
}

export async function findMembershipById(workspaceId: string, userId: string) {
  const [row] = await db
    .select({ workspace, membership })
    .from(membership)
    .innerJoin(workspace, eq(workspace.id, membership.workspaceId))
    .where(and(eq(membership.workspaceId, workspaceId), eq(membership.userId, userId), eq(membership.status, "active")))
    .limit(1);
  return row ?? null;
}

export async function listWorkspacesForUser(userId: string) {
  return db
    .select({ id: workspace.id, name: workspace.name, slug: workspace.slug, color: workspace.color, role: membership.role })
    .from(membership)
    .innerJoin(workspace, eq(workspace.id, membership.workspaceId))
    .where(and(eq(membership.userId, userId), eq(membership.status, "active")))
    .orderBy(workspace.name);
}

/** Workspace that owns this company domain (only id/name/autoJoin – no member data). */
export async function findWorkspaceByDomain(domain: string) {
  const [row] = await db
    .select({ id: workspace.id, name: workspace.name, slug: workspace.slug, autoJoin: workspace.autoJoin })
    .from(workspace)
    .where(eq(workspace.domain, domain.toLowerCase()))
    .limit(1);
  return row ?? null;
}

/** Open, unexpired invitations for an e-mail address, with workspace and inviter names. */
export async function listOpenInvitations(email: string) {
  return db
    .select({
      id: invitation.id,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      inviterName: user.name,
      role: invitation.role,
    })
    .from(invitation)
    .innerJoin(workspace, eq(workspace.id, invitation.workspaceId))
    .innerJoin(user, eq(user.id, invitation.invitedBy))
    .where(and(eq(invitation.email, email.toLowerCase()), isNull(invitation.acceptedAt), gt(invitation.expiresAt, new Date())));
}

export async function countSeats(workspaceId: string, tx: Tx | Db = db) {
  const [row] = await tx
    .select({
      active: sql<number>`count(*) filter (where ${membership.status} = 'active')`.mapWith(Number),
    })
    .from(membership)
    .where(eq(membership.workspaceId, workspaceId));
  const [inv] = await tx
    .select({ pending: sql<number>`count(*)`.mapWith(Number) })
    .from(invitation)
    .where(and(eq(invitation.workspaceId, workspaceId), isNull(invitation.acceptedAt), gt(invitation.expiresAt, new Date())));
  const active = row?.active ?? 0;
  const pending = inv?.pending ?? 0;
  return { active, pending, free: Math.max(0, MAX_USERS_PER_WORKSPACE - active - pending) };
}

export class LimitError extends Error {
  constructor(public readonly code: "max_users" | "max_subtasks" | "max_attachments") {
    super(code);
  }
}

/** Maps the trigger errors from drizzle/0001_limits_triggers.sql to a typed error. */
export function asLimitError(e: unknown): LimitError | null {
  const message = e instanceof Error ? `${e.message} ${String((e as { cause?: unknown }).cause ?? "")}` : "";
  if (message.includes("max_users")) return new LimitError("max_users");
  if (message.includes("max_subtasks")) return new LimitError("max_subtasks");
  if (message.includes("max_attachments")) return new LimitError("max_attachments");
  return null;
}

/** Adds an active membership. Throws LimitError("max_users") when the workspace is full. */
export async function addMember(tx: Tx, workspaceId: string, userId: string, role: Role = "member") {
  try {
    await tx
      .insert(membership)
      .values({ workspaceId, userId, role, status: "active" })
      .onConflictDoUpdate({ target: [membership.workspaceId, membership.userId], set: { status: "active" } });
  } catch (e) {
    throw asLimitError(e) ?? e;
  }
}

export async function createWorkspace(tx: Tx, input: { name: string; domain: string; color: string; slugBase: string; ownerId: string }) {
  const slug = await uniqueSlug(input.slugBase, async (candidate) => {
    const [hit] = await tx.select({ id: workspace.id }).from(workspace).where(eq(workspace.slug, candidate)).limit(1);
    return Boolean(hit);
  });
  const [created] = await tx
    .insert(workspace)
    .values({ name: input.name, domain: input.domain.toLowerCase(), color: input.color, slug })
    .returning();
  await addMember(tx, created!.id, input.ownerId, "owner");
  return created!;
}
