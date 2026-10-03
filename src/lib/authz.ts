import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { findMembershipById, findMembershipBySlug, type Role } from "@/db/queries/workspaces";
import { requireUser } from "@/lib/session";

/**
 * The only way into workspace data (CLAUDE.md rule 1). Non-members get a 404, so the
 * existence of foreign workspaces is not revealed.
 */
export const requireMember = cache(async (ref: { slug: string } | { workspaceId: string }) => {
  const user = await requireUser("slug" in ref ? `/${ref.slug}` : undefined);
  const row = "slug" in ref ? await findMembershipBySlug(ref.slug, user.id) : await findMembershipById(ref.workspaceId, user.id);
  if (!row) notFound();
  return { user, workspace: row.workspace, membership: row.membership };
});

export type MemberContext = Awaited<ReturnType<typeof requireMember>>;

const RANK: Record<Role, number> = { member: 0, admin: 1, owner: 2 };

export function hasRole(ctx: MemberContext, min: Role): boolean {
  return RANK[ctx.membership.role] >= RANK[min];
}

/** Like requireMember, plus a minimum role. Insufficient rights → 404 as well. */
export async function requireRole(ref: { slug: string } | { workspaceId: string }, min: Role) {
  const ctx = await requireMember(ref);
  if (!hasRole(ctx, min)) notFound();
  return ctx;
}
