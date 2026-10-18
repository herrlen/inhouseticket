import "server-only";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { invitation, membership, onboardingAnswer, user, userPref, workspace } from "@/db/schema";
import { DEFAULT_PREFS } from "@/db/queries/explorer";
import type { PreviousTool, Source, TeamType, View } from "@/lib/onboarding/options";

// Onboarding wizard (docs/ONBOARDING.md, ADR 006). Every write is idempotent: repeating a step
// (reload, double click, second device) overwrites, it never duplicates.

export type OnboardingUser = { id: string; name: string; email: string; timezone: string; onboardedAt: Date | null };

export async function getOnboardingUser(userId: string): Promise<OnboardingUser | null> {
  const [row] = await db
    .select({ id: user.id, name: user.name, email: user.email, timezone: user.timezone, onboardedAt: user.onboardedAt })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row ?? null;
}

const wizardWorkspace = {
  id: workspace.id,
  name: workspace.name,
  slug: workspace.slug,
  domain: workspace.domain,
  color: workspace.color,
  autoJoin: workspace.autoJoin,
  teamType: workspace.teamType,
  onboardingCompletedAt: workspace.onboardingCompletedAt,
};
export type WizardWorkspace = {
  id: string;
  name: string;
  slug: string;
  domain: string;
  color: string;
  autoJoin: boolean;
  teamType: string | null;
  onboardingCompletedAt: Date | null;
};

/** Newest workspace this person owns whose setup is not finished – the owner wizard continues there. */
export async function findUnfinishedOwnedWorkspace(userId: string): Promise<WizardWorkspace | null> {
  const [row] = await db
    .select(wizardWorkspace)
    .from(membership)
    .innerJoin(workspace, eq(workspace.id, membership.workspaceId))
    .where(
      and(
        eq(membership.userId, userId),
        eq(membership.role, "owner"),
        eq(membership.status, "active"),
        isNull(workspace.onboardingCompletedAt),
        isNull(workspace.lockedAt),
      ),
    )
    .orderBy(desc(workspace.createdAt))
    .limit(1);
  return row ?? null;
}

/** Workspace a joiner entered last (invitation or auto-join) – the short wizard runs there. */
export async function findNewestMembership(userId: string): Promise<WizardWorkspace | null> {
  const [row] = await db
    .select(wizardWorkspace)
    .from(membership)
    .innerJoin(workspace, eq(workspace.id, membership.workspaceId))
    .where(and(eq(membership.userId, userId), eq(membership.status, "active"), isNull(workspace.lockedAt)))
    .orderBy(desc(membership.createdAt))
    .limit(1);
  return row ?? null;
}

export async function getWizardPrefs(workspaceId: string, userId: string): Promise<{ defaultView: View | null; onboardingStep: number | null }> {
  const [row] = await db
    .select({ defaultView: userPref.defaultView, onboardingStep: userPref.onboardingStep })
    .from(userPref)
    .where(and(eq(userPref.workspaceId, workspaceId), eq(userPref.userId, userId)))
    .limit(1);
  return { defaultView: (row?.defaultView as View | undefined) ?? null, onboardingStep: row?.onboardingStep ?? null };
}

/**
 * Moves the wizard forward to `advanceTo` (never back – "Zurück" only navigates) and optionally
 * stores the start view. `advanceTo: null` clears the step (wizard done). Creates the row if needed.
 */
export async function saveWizardPrefs(workspaceId: string, userId: string, patch: { advanceTo?: number | null; defaultView?: View }) {
  const set: Partial<typeof userPref.$inferInsert> = {};
  if (patch.defaultView) set.defaultView = patch.defaultView;
  if (patch.advanceTo === null) set.onboardingStep = null;
  else if (patch.advanceTo !== undefined) set.onboardingStep = sql`greatest(coalesce(${userPref.onboardingStep}, 0), ${patch.advanceTo})` as unknown as number;
  await db
    .insert(userPref)
    .values({ workspaceId, userId, ...DEFAULT_PREFS, defaultView: patch.defaultView ?? "board", onboardingStep: patch.advanceTo ?? null })
    .onConflictDoUpdate({ target: [userPref.userId, userPref.workspaceId], set });
}

export async function saveTimezone(userId: string, timezone: string) {
  await db.update(user).set({ timezone }).where(eq(user.id, userId));
}

export async function markOnboarded(userId: string) {
  // Keeps the first timestamp: postponing and finishing later must not move it.
  await db.update(user).set({ onboardedAt: new Date() }).where(and(eq(user.id, userId), isNull(user.onboardedAt)));
}

/** Step 2 again: the workspace exists already – update it instead of creating a second one. */
export async function updateWorkspaceBasics(workspaceId: string, patch: { name: string; color: string; autoJoin: boolean }) {
  await db.update(workspace).set(patch).where(eq(workspace.id, workspaceId));
}

export async function saveTeamType(workspaceId: string, teamType: TeamType) {
  await db.update(workspace).set({ teamType }).where(eq(workspace.id, workspaceId));
}

export type OnboardingAnswer = { previousTools: PreviousTool[]; source: Source | null; sourceOther: string | null };

export async function getAnswer(workspaceId: string, userId: string): Promise<OnboardingAnswer | null> {
  const [row] = await db
    .select({ previousTools: onboardingAnswer.previousTools, source: onboardingAnswer.source, sourceOther: onboardingAnswer.sourceOther })
    .from(onboardingAnswer)
    .where(and(eq(onboardingAnswer.workspaceId, workspaceId), eq(onboardingAnswer.userId, userId)))
    .limit(1);
  return row ? { previousTools: row.previousTools as PreviousTool[], source: row.source as Source | null, sourceOther: row.sourceOther } : null;
}

export async function saveAnswer(workspaceId: string, userId: string, answer: OnboardingAnswer) {
  await db
    .insert(onboardingAnswer)
    .values({ workspaceId, userId, ...answer })
    .onConflictDoUpdate({ target: [onboardingAnswer.workspaceId, onboardingAnswer.userId], set: answer });
}

/** What the invite step needs for its chips: member addresses and open invitations. */
export async function inviteContext(workspaceId: string) {
  const [members, open] = await Promise.all([
    db
      .select({ email: user.email })
      .from(membership)
      .innerJoin(user, eq(user.id, membership.userId))
      .where(and(eq(membership.workspaceId, workspaceId), eq(membership.status, "active"))),
    db
      .select({ email: invitation.email })
      .from(invitation)
      .where(and(eq(invitation.workspaceId, workspaceId), isNull(invitation.acceptedAt), gt(invitation.expiresAt, new Date()))),
  ]);
  return { members: members.map((m) => m.email.toLowerCase()), pending: open.map((o) => o.email.toLowerCase()) };
}
