"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { createInvitations, sendInvitationMails } from "@/db/queries/invitations";
import { disableMember, findMemberInWorkspace, revokeInvitation, setAutoJoin, setMemberRole } from "@/db/queries/members";
import { requireRole } from "@/lib/authz";
import { de } from "@/lib/i18n/de";
import { canChangeRole, canInviteAs, canRemove } from "@/lib/member-permissions";
import { inviteSchema, roleChangeSchema } from "@/lib/validation/workspace";
import { rateLimit } from "@/lib/rate-limit";
import { isPersonalWorkspaceDomain } from "@/lib/workspace-domain";

export type ActionState = { error?: string; success?: string };

/** Invitation mails per workspace and hour – protects the shared sender address. */
const INVITE_MAILS_PER_HOUR = 100;

const workspaceRef = z.object({ workspaceId: z.uuid() });
const path = (slug: string) => `/${slug}/settings/members`;

export async function inviteAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { workspaceId } = workspaceRef.parse({ workspaceId: formData.get("workspaceId") });
  const ctx = await requireRole({ workspaceId }, "admin");
  const parsed = inviteSchema.safeParse({ emails: formData.get("emails") ?? "", role: formData.get("role") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  if (!canInviteAs(ctx.membership.role, parsed.data.role)) return { error: de.members.noPermission };
  if (!rateLimit(`invite:${workspaceId}`, INVITE_MAILS_PER_HOUR, 3_600_000, Date.now(), parsed.data.emails.length).ok) {
    return { error: de.members.tooManyInvites };
  }

  const { result, mails } = await db.transaction((tx) =>
    createInvitations(tx, { workspaceId, inviterId: ctx.user.id, emails: parsed.data.emails, role: parsed.data.role }),
  );
  await sendInvitationMails(mails, ctx.user.name, ctx.workspace.name);
  revalidatePath(path(ctx.workspace.slug));

  const notes = [
    result.invited.length ? de.members.invited(result.invited.length) : null,
    result.alreadyMember.length ? de.members.alreadyMember(result.alreadyMember.join(", ")) : null,
    result.overLimit.length ? de.members.overLimit(result.overLimit.join(", ")) : null,
  ].filter(Boolean);
  return result.invited.length ? { success: notes.join(" ") } : { error: notes.join(" ") };
}

export async function changeRoleAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { workspaceId } = workspaceRef.parse({ workspaceId: formData.get("workspaceId") });
  const ctx = await requireRole({ workspaceId }, "owner");
  const input = roleChangeSchema.safeParse({ membershipId: formData.get("membershipId"), role: formData.get("role") });
  if (!input.success) return { error: de.common.invalidInput };
  const target = await findMemberInWorkspace(workspaceId, input.data.membershipId);
  if (!target || !canChangeRole({ role: ctx.membership.role, userId: ctx.user.id }, target)) return { error: de.members.noPermission };
  await setMemberRole(workspaceId, input.data.membershipId, input.data.role);
  revalidatePath(path(ctx.workspace.slug));
  return { success: de.members.roleChanged };
}

export async function removeMemberAction(formData: FormData) {
  const { workspaceId } = workspaceRef.parse({ workspaceId: formData.get("workspaceId") });
  const ctx = await requireRole({ workspaceId }, "admin");
  const membershipId = z.uuid().parse(formData.get("membershipId"));
  const target = await findMemberInWorkspace(workspaceId, membershipId);
  if (!target || !canRemove({ role: ctx.membership.role, userId: ctx.user.id }, target)) return;
  await disableMember(workspaceId, membershipId);
  revalidatePath(path(ctx.workspace.slug));
}

export async function revokeInvitationAction(formData: FormData) {
  const { workspaceId } = workspaceRef.parse({ workspaceId: formData.get("workspaceId") });
  const ctx = await requireRole({ workspaceId }, "admin");
  await revokeInvitation(workspaceId, z.uuid().parse(formData.get("invitationId")), ctx.membership.role);
  revalidatePath(path(ctx.workspace.slug));
}

export async function setAutoJoinAction(formData: FormData) {
  const { workspaceId } = workspaceRef.parse({ workspaceId: formData.get("workspaceId") });
  const ctx = await requireRole({ workspaceId }, "owner");
  // A personal workspace has no company domain anyone could join through.
  if (isPersonalWorkspaceDomain(ctx.workspace.domain)) return;
  await setAutoJoin(workspaceId, formData.get("autoJoin") === "on");
  revalidatePath(path(ctx.workspace.slug));
}
