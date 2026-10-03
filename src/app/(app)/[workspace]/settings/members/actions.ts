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

export type ActionState = { error?: string; success?: string };

const workspaceRef = z.object({ workspaceId: z.uuid() });
const path = (slug: string) => `/${slug}/settings/members`;

export async function inviteAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { workspaceId } = workspaceRef.parse({ workspaceId: formData.get("workspaceId") });
  const ctx = await requireRole({ workspaceId }, "admin");
  const parsed = inviteSchema.safeParse({ emails: formData.get("emails") ?? "", role: formData.get("role") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  if (!canInviteAs(ctx.membership.role, parsed.data.role)) return { error: de.members.noPermission };

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

export async function changeRoleAction(formData: FormData) {
  const { workspaceId } = workspaceRef.parse({ workspaceId: formData.get("workspaceId") });
  const ctx = await requireRole({ workspaceId }, "owner");
  const input = roleChangeSchema.parse({ membershipId: formData.get("membershipId"), role: formData.get("role") });
  const target = await findMemberInWorkspace(workspaceId, input.membershipId);
  if (!target || !canChangeRole({ role: ctx.membership.role, userId: ctx.user.id }, target)) return;
  await setMemberRole(workspaceId, input.membershipId, input.role);
  revalidatePath(path(ctx.workspace.slug));
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
  await revokeInvitation(workspaceId, z.uuid().parse(formData.get("invitationId")));
  revalidatePath(path(ctx.workspace.slug));
}

export async function setAutoJoinAction(formData: FormData) {
  const { workspaceId } = workspaceRef.parse({ workspaceId: formData.get("workspaceId") });
  const ctx = await requireRole({ workspaceId }, "owner");
  await setAutoJoin(workspaceId, formData.get("autoJoin") === "on");
  revalidatePath(path(ctx.workspace.slug));
}
