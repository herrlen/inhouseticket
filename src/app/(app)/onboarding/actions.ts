"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import type { z } from "zod";
import { db } from "@/db/client";
import { createInvitations, sendInvitationMails, type InvitationMail } from "@/db/queries/invitations";
import {
  findUnfinishedOwnedWorkspace,
  inviteContext,
  markOnboarded,
  saveAnswer,
  saveTimezone,
  saveTeamType,
  saveWizardPrefs,
  updateWorkspaceBasics,
} from "@/db/queries/onboarding";
import { completeOnboarding } from "@/db/queries/onboarding-complete";
import { createWorkspace, findWorkspaceByDomain } from "@/db/queries/workspaces";
import { workspace as workspaceTable } from "@/db/schema";
import { auth } from "@/lib/auth";
import { requireMember, requireRole, type MemberContext } from "@/lib/authz";
import { getLocale, getT } from "@/lib/i18n/server";
import { takeInviteMails } from "@/lib/invite-limit";
import { MAX_USERS_PER_WORKSPACE } from "@/lib/limits";
import { trackServerEvent } from "@/lib/matomo";
import { parseInviteInput, SENDABLE } from "@/lib/onboarding/invite-input";
import { STEPS } from "@/lib/onboarding/options";
import { requireUser } from "@/lib/session";
import { slugFromDomain } from "@/lib/slug";
import {
  inviteStepSchema,
  profileStepSchema,
  questionsStepSchema,
  teamStepSchema,
  viewStepSchema,
  workspaceRefSchema,
  workspaceStepSchema,
} from "@/lib/validation/onboarding";
import { isPersonalWorkspaceDomain, workspaceDomainOf } from "@/lib/workspace-domain";

// One Server Action per wizard step (docs/ONBOARDING.md §2.3, ADR 006). Each validates with Zod,
// checks access itself (never trusts the page), saves at once and is idempotent: running a step
// twice overwrites. The client moves on when `ok` is true and follows `redirect` when given.

export type StepResult = { ok: true; workspaceId?: string; redirect?: string } | { ok: false; errors: Record<string, string> };

async function invalid(error: z.ZodError): Promise<StepResult> {
  const t = await getT();
  const errors: Record<string, string> = {};
  for (const issue of error.issues) errors[String(issue.path[0] ?? "form")] ??= t.validation(issue.message);
  return { ok: false, errors };
}

/** The owner wizard of this workspace is still open: the person owns it and setup is not done. */
async function requireOpenOwnerWizard(workspaceId: string): Promise<MemberContext | null> {
  const ctx = await requireRole({ workspaceId }, "owner");
  return ctx.workspace.onboardingCompletedAt ? null : ctx;
}

const isOwnerWizard = (ctx: MemberContext) => ctx.membership.role === "owner" && !ctx.workspace.onboardingCompletedAt;

async function stale(): Promise<StepResult> {
  return { ok: false, errors: { form: (await getT()).onboarding.stale } };
}

/** Step 1: name and time zone. Before step 2 there is no workspace yet (`workspaceId` null). */
export async function saveProfileStep(input: { name: string; timezone: string; workspaceId: string | null }): Promise<StepResult> {
  const user = await requireUser();
  const parsed = profileStepSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = input.workspaceId ? await requireMember({ workspaceId: workspaceRefSchema.parse(input).workspaceId }) : null;
  // Through Better Auth: refreshes the cached session, so the new name shows up at once.
  await auth.api.updateUser({ body: { name: parsed.data.name }, headers: await headers() });
  await saveTimezone(user.id, parsed.data.timezone);
  if (ctx) await saveWizardPrefs(ctx.workspace.id, user.id, { advanceTo: isOwnerWizard(ctx) ? STEPS.workspace : STEPS.view });
  return { ok: true, workspaceId: ctx?.workspace.id };
}

/** Step 2: creates the workspace – or updates it when the person comes back to this step. */
export async function saveWorkspaceStep(input: { name: string; color: string; autoJoin: boolean }): Promise<StepResult> {
  const user = await requireUser();
  const parsed = workspaceStepSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const domain = workspaceDomainOf(user.email);
  if (!domain) return stale();
  // A personal workspace (exempt address) has no domain anyone could join through.
  const autoJoin = isPersonalWorkspaceDomain(domain) ? false : parsed.data.autoJoin;

  const open = await findUnfinishedOwnedWorkspace(user.id);
  if (open) {
    const ctx = await requireOpenOwnerWizard(open.id);
    if (!ctx) return stale();
    await updateWorkspaceBasics(open.id, { name: parsed.data.name, color: parsed.data.color, autoJoin });
    await saveWizardPrefs(open.id, user.id, { advanceTo: STEPS.team });
    return { ok: true, workspaceId: open.id };
  }

  // Someone from the same domain was faster, or the person already has their workspace → /start.
  if (await findWorkspaceByDomain(domain)) return { ok: true, redirect: "/start" };
  let workspaceId: string;
  try {
    workspaceId = await db.transaction(async (tx) => {
      const ws = await createWorkspace(tx, {
        name: parsed.data.name,
        domain,
        color: parsed.data.color,
        slugBase: isPersonalWorkspaceDomain(domain) ? parsed.data.name : slugFromDomain(domain),
        ownerId: user.id,
      });
      await tx.update(workspaceTable).set({ autoJoin }).where(eq(workspaceTable.id, ws.id));
      return ws.id;
    });
  } catch (e) {
    if (String((e as { cause?: unknown })?.cause ?? e).includes("workspace_domain_unique")) return { ok: true, redirect: "/start" };
    throw e;
  }
  await saveWizardPrefs(workspaceId, user.id, { advanceTo: STEPS.team });
  await trackServerEvent({ category: "Workspace", action: "Created", path: "/onboarding" });
  return { ok: true, workspaceId };
}

/** Step 3: team area – decides the project template created at the end. */
export async function saveTeamStep(input: { workspaceId: string; teamType: string }): Promise<StepResult> {
  const parsed = teamStepSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await requireOpenOwnerWizard(parsed.data.workspaceId);
  if (!ctx) return stale();
  await saveTeamType(ctx.workspace.id, parsed.data.teamType);
  await saveWizardPrefs(ctx.workspace.id, ctx.user.id, { advanceTo: STEPS.view });
  return { ok: true };
}

/** Step 4: start view (per person). Joiners are done here and land in "Meine Aufgaben". */
export async function saveViewStep(input: { workspaceId: string; view: string }): Promise<StepResult> {
  const parsed = viewStepSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await requireMember({ workspaceId: parsed.data.workspaceId });
  if (isOwnerWizard(ctx)) {
    await saveWizardPrefs(ctx.workspace.id, ctx.user.id, { defaultView: parsed.data.view, advanceTo: STEPS.questions });
    return { ok: true };
  }
  await saveWizardPrefs(ctx.workspace.id, ctx.user.id, { defaultView: parsed.data.view, advanceTo: null });
  await markOnboarded(ctx.user.id);
  return { ok: true, redirect: `/${ctx.workspace.slug}/me` };
}

/** Step 5: two optional questions. `skip` moves on without storing anything. */
export async function saveQuestionsStep(input: {
  workspaceId: string;
  previousTools: string[];
  source: string | null;
  sourceOther?: string;
  skip?: boolean;
}): Promise<StepResult> {
  const parsed = questionsStepSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await requireOpenOwnerWizard(parsed.data.workspaceId);
  if (!ctx) return stale();
  if (!input.skip) {
    const { previousTools, source, sourceOther } = parsed.data;
    await saveAnswer(ctx.workspace.id, ctx.user.id, { previousTools, source, sourceOther });
  }
  await saveWizardPrefs(ctx.workspace.id, ctx.user.id, { advanceTo: STEPS.invite });
  return { ok: true };
}

/**
 * Step 6 and the end: invitations plus the template project in one transaction, then the chosen
 * view opens. An empty list is "Überspringen". Repeating it after success creates nothing twice.
 */
export async function finishOnboarding(input: { workspaceId: string; emails: string[] }): Promise<StepResult> {
  const t = await getT();
  const parsed = inviteStepSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await requireRole({ workspaceId: parsed.data.workspaceId }, "owner");
  if (ctx.workspace.onboardingCompletedAt) return { ok: true, redirect: `/${ctx.workspace.slug}` };

  // Same rules as the chips in the browser – checked again here.
  const known = await inviteContext(ctx.workspace.id);
  const chips = parseInviteInput(parsed.data.emails.join("\n"), { domain: ctx.workspace.domain, members: known.members });
  if (chips.some((c) => c.status === "freemail" || c.status === "invalid")) return { ok: false, errors: { emails: t.onboarding.invite.refused } };
  const emails = chips.filter((c) => SENDABLE.has(c.status) || c.status === "duplicate").map((c) => c.email);
  const unique = [...new Set(emails)];
  if (unique.length > 0 && !takeInviteMails(ctx.workspace.id, unique.length)) return { ok: false, errors: { emails: t.members.tooManyInvites } };

  const locale = await getLocale();
  let mails: InvitationMail[] = [];
  let target: string;
  try {
    ({ mails, target } = await db.transaction(async (tx) => {
      const invites = await createInvitations(tx, { workspaceId: ctx.workspace.id, inviterId: ctx.user.id, emails: unique, role: "member" });
      // Seat limit incl. open invitations: all or nothing, the person shortens the list.
      if (invites.result.overLimit.length > 0) throw new SeatsFull();
      const done = await completeOnboarding(tx, { workspaceId: ctx.workspace.id, userId: ctx.user.id, locale, invited: invites.result.invited.length > 0 });
      return { mails: invites.mails, target: done.target };
    }));
  } catch (e) {
    if (e instanceof SeatsFull) return { ok: false, errors: { emails: t.onboarding.invite.full(MAX_USERS_PER_WORKSPACE) } };
    throw e;
  }

  if (mails.length > 0) {
    await sendInvitationMails(mails, ctx.user.name, ctx.workspace.name);
    await trackServerEvent({ category: "Team", action: "Member invited", name: "onboarding", value: mails.length, path: "/onboarding" });
  }
  return { ok: true, redirect: target };
}

class SeatsFull extends Error {}

/** "Später fertigstellen" (after step 2): into the app now, the banner brings the person back. */
export async function postponeOnboarding(input: { workspaceId: string }): Promise<StepResult> {
  const { workspaceId } = workspaceRefSchema.parse(input);
  const ctx = await requireRole({ workspaceId }, "owner");
  await markOnboarded(ctx.user.id);
  return { ok: true, redirect: `/${ctx.workspace.slug}` };
}
