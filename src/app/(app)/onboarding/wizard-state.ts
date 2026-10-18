// Client-side state of the wizard: one object for all steps, so "Zurück" keeps what was typed.
import type { InviteChip } from "@/lib/onboarding/invite-input";
import type { PreviousTool, Source, TeamType, View } from "@/lib/onboarding/options";
import type { WizardProps } from "./types";

export type WizardData = {
  name: string;
  timezone: string;
  wsName: string;
  color: string;
  autoJoin: boolean;
  teamType: TeamType | null;
  view: View;
  tools: PreviousTool[];
  source: Source | null;
  sourceOther: string;
  chips: InviteChip[];
  /** Text in the invite field not yet turned into chips. */
  draft: string;
};

export type StepProps = {
  data: WizardData;
  set: (patch: Partial<WizardData>) => void;
  errors: Record<string, string>;
  props: WizardProps;
};

export function initialData(p: WizardProps): WizardData {
  return {
    name: p.profile.name,
    timezone: p.profile.timezone,
    wsName: p.workspace.name,
    color: p.workspace.color,
    autoJoin: p.workspace.autoJoin,
    teamType: p.teamType,
    view: p.view,
    tools: p.answers.previousTools,
    source: p.answers.source,
    sourceOther: p.answers.sourceOther,
    chips: [],
    draft: "",
  };
}
