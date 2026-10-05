import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { findMembershipById, findMembershipBySlug, type Role } from "@/db/queries/workspaces";
import { rateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";

/** Page renders and server actions per person – far above real use, stops scripted floods. */
const MEMBER_REQUESTS_PER_MINUTE = 600;

export class RateLimitedError extends Error {
  constructor(readonly retryAfterSec: number) {
    super("rate_limited");
  }
}

/**
 * The only way into workspace data (CLAUDE.md rule 1). Non-members get a 404, so the
 * existence of foreign workspaces is not revealed.
 */
export const requireMember = cache(async (ref: { slug: string } | { workspaceId: string }) => {
  const user = await requireUser("slug" in ref ? `/${ref.slug}` : undefined);
  const limit = rateLimit(`member:${user.id}`, MEMBER_REQUESTS_PER_MINUTE, 60_000);
  if (!limit.ok) throw new RateLimitedError(limit.retryAfterSec);
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
