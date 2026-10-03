import "server-only";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { invitation, membership, user, workspace } from "@/db/schema";
import { countSeats, type Role, type Tx } from "@/db/queries/workspaces";
import { env } from "@/lib/env";
import { de } from "@/lib/i18n/de";
import { buttonMail, sendMail } from "@/lib/mail";
import { hashToken, newToken } from "@/lib/tokens";

const INVITATION_TTL_DAYS = 7;

export type InviteResult = { invited: string[]; alreadyMember: string[]; overLimit: string[] };
export type InvitationMail = { email: string; token: string };

/**
 * Creates (or renews) invitations inside a transaction. Addresses must already be validated
 * as company e-mails. Respects the seat limit: active members + open invitations ≤ 100.
 * Send the returned mails with sendInvitationMails() after the transaction committed.
 */
export async function createInvitations(
  tx: Tx,
  input: { workspaceId: string; inviterId: string; emails: string[]; role: Exclude<Role, "owner"> },
): Promise<{ result: InviteResult; mails: InvitationMail[] }> {
  const emails = [...new Set(input.emails.map((e) => e.trim().toLowerCase()))];
  const result: InviteResult = { invited: [], alreadyMember: [], overLimit: [] };
  if (emails.length === 0) return { result, mails: [] };

  const members = await tx
    .select({ email: user.email })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.userId))
    .where(and(eq(membership.workspaceId, input.workspaceId), eq(membership.status, "active"), inArray(user.email, emails)));
  const memberEmails = new Set(members.map((m) => m.email.toLowerCase()));

  // Renewing an existing invitation does not take an extra seat.
  const open = await tx
    .select({ email: invitation.email })
    .from(invitation)
    .where(and(eq(invitation.workspaceId, input.workspaceId), isNull(invitation.acceptedAt), gt(invitation.expiresAt, new Date())));
  const openEmails = new Set(open.map((o) => o.email));

  let { free } = await countSeats(input.workspaceId, tx);
  const mails: InvitationMail[] = [];

  for (const email of emails) {
    if (memberEmails.has(email)) {
      result.alreadyMember.push(email);
      continue;
    }
    if (!openEmails.has(email)) {
      if (free <= 0) {
        result.overLimit.push(email);
        continue;
      }
      free--;
    }
    const token = newToken();
    await tx.delete(invitation).where(and(eq(invitation.workspaceId, input.workspaceId), eq(invitation.email, email), isNull(invitation.acceptedAt)));
    await tx.insert(invitation).values({
      workspaceId: input.workspaceId,
      email,
      role: input.role,
      tokenHash: hashToken(token),
      invitedBy: input.inviterId,
      expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000),
    });
    mails.push({ email, token });
    result.invited.push(email);
  }
  return { result, mails };
}

export async function sendInvitationMails(mails: InvitationMail[], inviterName: string, workspaceName: string) {
  const m = de.invite.mail(inviterName, workspaceName);
  for (const { email, token } of mails) {
    const url = `${env.APP_URL}/invite/${token}`;
    await sendMail({
      to: email,
      subject: m.subject,
      text: `${m.intro}\n\n${url}\n\n${m.outro}`,
      html: buttonMail({ heading: m.heading, intro: m.intro, button: m.button, url, outro: m.outro }),
    });
  }
}

/** Looks up an open invitation by its plain token (from the link). */
export async function findInvitationByToken(token: string) {
  const [row] = await db
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      acceptedAt: invitation.acceptedAt,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      workspaceSlug: workspace.slug,
      inviterName: user.name,
    })
    .from(invitation)
    .innerJoin(workspace, eq(workspace.id, invitation.workspaceId))
    .innerJoin(user, eq(user.id, invitation.invitedBy))
    .where(eq(invitation.tokenHash, hashToken(token)))
    .limit(1);
  return row ?? null;
}
