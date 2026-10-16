"use server";

import { and, eq, gt, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { addMember, findWorkspaceByDomain, LimitError } from "@/db/queries/workspaces";
import { invitation, workspace } from "@/db/schema";
import { workspaceDomainOf } from "@/lib/workspace-domain";
import { getT } from "@/lib/i18n/server";
import { requireUser } from "@/lib/session";

export type JoinState = { error?: string };

/** Accepts an open invitation addressed to the signed-in user's e-mail. */
export async function acceptInvitation(_: JoinState, formData: FormData): Promise<JoinState> {
  const t = await getT();
  const user = await requireUser();
  const invitationId = String(formData.get("invitationId") ?? "");

  let slug: string;
  try {
    slug = await db.transaction(async (tx) => {
      const [inv] = await tx
        .select({ id: invitation.id, workspaceId: invitation.workspaceId, role: invitation.role, slug: workspace.slug })
        .from(invitation)
        .innerJoin(workspace, eq(workspace.id, invitation.workspaceId))
        .where(
          and(
            eq(invitation.id, invitationId),
            eq(invitation.email, user.email.toLowerCase()),
            isNull(invitation.acceptedAt),
            gt(invitation.expiresAt, new Date()),
          ),
        )
        .for("update")
        .limit(1);
      if (!inv) throw new Error("invitation_not_found");
      await addMember(tx, inv.workspaceId, user.id, inv.role);
      await tx.update(invitation).set({ acceptedAt: new Date() }).where(eq(invitation.id, inv.id));
      return inv.slug;
    });
  } catch (e) {
    if (e instanceof LimitError) return { error: t.start.full };
    if (e instanceof Error && e.message === "invitation_not_found") return { error: t.start.invitationGone };
    throw e;
  }
  redirect(`/${slug}`);
}

/** Joins the workspace of the user's own domain – only if the owner enabled auto-join. */
export async function joinByDomain(): Promise<JoinState> {
  const t = await getT();
  const user = await requireUser();
  const domain = workspaceDomainOf(user.email);
  const ws = domain ? await findWorkspaceByDomain(domain) : null;
  if (!ws?.autoJoin) return { error: t.start.autoJoinOff };
  try {
    await db.transaction((tx) => addMember(tx, ws.id, user.id, "member"));
  } catch (e) {
    if (e instanceof LimitError) return { error: t.start.full };
    throw e;
  }
  redirect(`/${ws.slug}`);
}
