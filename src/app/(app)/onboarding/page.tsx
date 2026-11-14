import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  findNewestMembership,
  findUnfinishedOwnedWorkspace,
  getAnswer,
  getOnboardingUser,
  getWizardPrefs,
  inviteContext,
  type WizardWorkspace,
} from "@/db/queries/onboarding";
import { findWorkspaceByDomain, listOpenInvitations } from "@/db/queries/workspaces";
import { getT } from "@/lib/i18n/server";
import { NOINDEX_ROBOTS } from "@/lib/indexing";
import { MAX_USERS_PER_WORKSPACE } from "@/lib/limits";
import { workspaceNameFromDomain } from "@/lib/onboarding/names";
import { DEFAULT_VIEW, JOINER_STEPS, OWNER_STEPS, TEAM_TYPES, stepKeyOf, type StepKey, type TeamType } from "@/lib/onboarding/options";
import { PALETTE } from "@/lib/palette";
import { requireUser } from "@/lib/session";
import { INSTANCE } from "@/lib/site";
import { isPersonalWorkspaceDomain, workspaceDomainOf } from "@/lib/workspace-domain";
import { Backdrop } from "./backdrop";
import type { WizardProps } from "./types";
import { Wizard } from "./wizard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.onboarding.title, robots: NOINDEX_ROBOTS };
}

type Props = { searchParams: Promise<{ step?: string }> };

/**
 * Onboarding wizard (docs/ONBOARDING.md, ADR 006) as a card over the app. Decides who sees what:
 * an owner whose workspace is not set up yet, a new person whose domain has no workspace, or a
 * joiner (invitation/auto-join) who has not been onboarded. Everyone else goes to /start.
 */
export default async function OnboardingPage({ searchParams }: Props) {
  const session = await requireUser("/onboarding");
  const user = await getOnboardingUser(session.id);
  if (!user) redirect("/start");
  const domain = workspaceDomainOf(user.email);
  if (!domain) redirect("/start");

  let mode: WizardProps["mode"];
  let ws: WizardWorkspace | null = await findUnfinishedOwnedWorkspace(user.id);
  if (ws) mode = "owner";
  else if (user.onboardedAt) redirect("/start");
  else {
    ws = await findNewestMembership(user.id);
    if (ws) mode = "joiner";
    else {
      // No workspace yet: only the first person of a domain sets one up; the rest chooses on /start.
      const [own, invitations] = await Promise.all([findWorkspaceByDomain(domain), listOpenInvitations(user.email)]);
      if (own || invitations.length > 0) redirect("/start");
      mode = "owner";
    }
  }

  const steps = mode === "owner" ? OWNER_STEPS : JOINER_STEPS;
  const [prefs, answer, known] = ws
    ? await Promise.all([getWizardPrefs(ws.id, user.id), getAnswer(ws.id, user.id), inviteContext(ws.id)])
    : [null, null, { members: [user.email], pending: [] }];

  // Resume at the saved step; ?step= (kept in the URL while clicking through) may go back, never ahead.
  const saved = stepKeyOf(prefs?.onboardingStep) ?? (ws ? (mode === "owner" ? "team" : "profile") : "profile");
  const furthest = ws ? saved : "workspace";
  const requested = stepKeyOf(Number((await searchParams).step));
  const index = (k: StepKey | undefined) => (k ? steps.indexOf(k) : -1);
  const initialStep = requested && index(requested) >= 0 && index(requested) <= index(furthest) ? requested : steps[Math.max(0, index(saved))]!;

  const props: WizardProps = {
    selfHosted: INSTANCE.selfHosted,
    mode,
    steps,
    initialStep,
    profile: { name: user.name, email: user.email, timezone: user.timezone, detectTimezone: index(saved) <= 0, userId: user.id },
    workspace: {
      id: ws?.id ?? null,
      name: ws?.name ?? workspaceNameFromDomain(domain),
      color: ws?.color ?? PALETTE.indigo,
      // Recommendation in docs/ONBOARDING.md §6: pre-selected on for a new workspace.
      autoJoin: ws ? ws.autoJoin : !isPersonalWorkspaceDomain(domain),
      domain: ws?.domain ?? domain,
      personal: isPersonalWorkspaceDomain(ws?.domain ?? domain),
    },
    teamType: TEAM_TYPES.includes(ws?.teamType as TeamType) ? (ws!.teamType as TeamType) : null,
    view: prefs?.defaultView ?? DEFAULT_VIEW,
    answers: { previousTools: answer?.previousTools ?? [], source: answer?.source ?? null, sourceOther: answer?.sourceOther ?? "" },
    invites: {
      members: known.members,
      pending: known.pending,
      seatsUsed: known.members.length + known.pending.length,
      maxSeats: MAX_USERS_PER_WORKSPACE,
    },
  };

  return (
    <>
      <Backdrop name={ws?.name ?? props.workspace.name} color={props.workspace.color} />
      <Wizard {...props} />
    </>
  );
}
