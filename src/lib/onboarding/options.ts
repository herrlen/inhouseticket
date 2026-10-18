// Allowed values of the onboarding wizard (docs/ONBOARDING.md §2–3). Plain constants, client-safe:
// the wizard renders them, src/lib/validation/onboarding.ts turns them into Zod enums and
// src/db/schema.ts into CHECK constraints.

/** Team area → project template (step 3). Order = order of the pills. */
export const TEAM_TYPES = ["marketing", "it", "support", "office", "sales", "creative", "dev", "general"] as const;
export type TeamType = (typeof TEAM_TYPES)[number];

/** "Bisher genutzt" (step 5a, multiple choice). */
export const PREVIOUS_TOOLS = ["excel", "jira", "trello", "asana", "clickup", "monday", "notion", "none", "other"] as const;
export type PreviousTool = (typeof PREVIOUS_TOOLS)[number];

/** Tools whose export our import reads (Sprint 10) – step 5 shows the import hint for these. */
export const IMPORTABLE_TOOLS: ReadonlySet<PreviousTool> = new Set(["jira", "clickup", "monday", "notion"]);

/** "Woher kennst du uns?" (step 5b, single choice; "other" with free text). */
export const SOURCES = ["search", "linkedin", "referral", "ai", "podcast", "reviews", "producthunt", "other"] as const;
export type Source = (typeof SOURCES)[number];

/** Start view (step 4), stored per user in user_pref.default_view. */
export const VIEWS = ["board", "list"] as const;
export type View = (typeof VIEWS)[number];
export const DEFAULT_VIEW: View = "board";

/**
 * Wizard steps as numbered in docs/ONBOARDING.md §2.1. user_pref.onboarding_step stores the number
 * of the next step to do. Joiners (invitation/auto-join) only see profile and view (§2.2).
 */
export const STEPS = { profile: 1, workspace: 2, team: 3, view: 4, questions: 5, invite: 6 } as const;
export type StepKey = keyof typeof STEPS;
export const OWNER_STEPS: readonly StepKey[] = ["profile", "workspace", "team", "view", "questions", "invite"];
export const JOINER_STEPS: readonly StepKey[] = ["profile", "view"];
/** Steps with an "Überspringen" button. */
export const OPTIONAL_STEPS: ReadonlySet<StepKey> = new Set(["questions", "invite"]);

export function stepKeyOf(n: number | null | undefined): StepKey | undefined {
  return (Object.keys(STEPS) as StepKey[]).find((k) => STEPS[k] === n);
}
