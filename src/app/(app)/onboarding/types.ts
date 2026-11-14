// What the onboarding page hands to the wizard (plain data, no server imports).
import type { PreviousTool, Source, StepKey, TeamType, View } from "@/lib/onboarding/options";

export type WizardProps = {
  /** Company instance (SELF_HOSTED): no terms or DPA to accept – they belong to the hosted service. */
  selfHosted: boolean;
  mode: "owner" | "joiner";
  steps: readonly StepKey[];
  /** Step shown first (resumed from user_pref.onboarding_step or ?step=). */
  initialStep: StepKey;
  profile: { name: string; email: string; timezone: string; detectTimezone: boolean; userId: string };
  workspace: {
    id: string | null;
    name: string;
    color: string;
    autoJoin: boolean;
    /** Company domain, or the full address for a personal workspace. */
    domain: string;
    personal: boolean;
  };
  teamType: TeamType | null;
  view: View;
  answers: { previousTools: PreviousTool[]; source: Source | null; sourceOther: string };
  invites: { members: string[]; pending: string[]; seatsUsed: number; maxSeats: number };
};
