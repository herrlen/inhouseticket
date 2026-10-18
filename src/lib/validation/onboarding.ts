import { z } from "zod";
import { MAX_INVITES_PER_STEP, MAX_SOURCE_OTHER, MAX_TIMEZONE } from "@/lib/limits";
import { PREVIOUS_TOOLS, SOURCES, TEAM_TYPES, VIEWS } from "@/lib/onboarding/options";
import { PALETTE } from "@/lib/palette";
import { registrationNameSchema } from "@/lib/validation/registration";
import { workspaceNameSchema } from "@/lib/validation/workspace";

// One schema per wizard step (docs/ONBOARDING.md §2.3). Messages in German, translated at the
// server edge with t.validation().

const paletteHex = Object.values(PALETTE) as [string, ...string[]];

/** True for IANA zones the runtime knows ("Europe/Berlin", "UTC"); never throws. */
export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const workspaceIdSchema = z.uuid("Ungültige Eingabe.");

export const profileStepSchema = z.object({
  name: registrationNameSchema,
  timezone: z
    .string("Bitte eine Zeitzone wählen.")
    .trim()
    .max(MAX_TIMEZONE, "Bitte eine Zeitzone wählen.")
    .refine(isTimeZone, "Bitte eine Zeitzone wählen."),
});

export const workspaceStepSchema = z.object({
  name: workspaceNameSchema,
  color: z.enum(paletteHex, "Bitte eine Farbe aus der Palette wählen."),
  autoJoin: z.boolean("Ungültige Eingabe."),
});

export const teamStepSchema = z.object({
  workspaceId: workspaceIdSchema,
  teamType: z.enum(TEAM_TYPES, "Bitte einen Bereich wählen."),
});

export const viewStepSchema = z.object({
  workspaceId: workspaceIdSchema,
  view: z.enum(VIEWS, "Bitte eine Ansicht wählen."),
});

export const questionsStepSchema = z
  .object({
    workspaceId: workspaceIdSchema,
    previousTools: z
      .array(z.enum(PREVIOUS_TOOLS, "Ungültige Eingabe."), "Ungültige Eingabe.")
      .max(PREVIOUS_TOOLS.length, "Ungültige Eingabe.")
      .transform((tools) => [...new Set(tools)]),
    source: z.enum(SOURCES, "Ungültige Eingabe.").nullable(),
    sourceOther: z.string("Ungültige Eingabe.").trim().max(MAX_SOURCE_OTHER, `Höchstens ${MAX_SOURCE_OTHER} Zeichen.`).optional(),
  })
  // The free text belongs to "Andere" only; anything else drops it.
  .transform((v) => ({ ...v, sourceOther: v.source === "other" && v.sourceOther ? v.sourceOther : null }));

export const inviteStepSchema = z.object({
  workspaceId: workspaceIdSchema,
  emails: z
    .array(z.string("Ungültige Eingabe.").max(320, "Ungültige Eingabe."), "Ungültige Eingabe.")
    .max(MAX_INVITES_PER_STEP, `Höchstens ${MAX_INVITES_PER_STEP} Adressen auf einmal.`),
});

export const workspaceRefSchema = z.object({ workspaceId: workspaceIdSchema });
