import { z } from "zod";
import { getEmailDomain, isCompanyEmail } from "@/lib/freemail";
import { PALETTE } from "@/lib/palette";
import { TEMPLATE_IDS } from "@/lib/project-templates";

const paletteHex = Object.values(PALETTE) as [string, ...string[]];

export const workspaceNameSchema = z
  .string()
  .trim()
  .min(2, "Mindestens 2 Zeichen.")
  .max(100, "Höchstens 100 Zeichen.");

/** Splits "a@x.de, b@x.de; c@x.de" into valid company addresses and rejected entries. */
export function parseEmailList(input: string): { valid: string[]; invalid: string[] } {
  const parts = input
    .split(/[\s,;]+/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const p of new Set(parts)) (getEmailDomain(p) && isCompanyEmail(p) ? valid : invalid).push(p);
  return { valid, invalid };
}

export const MAX_INVITES_PER_REQUEST = 50;

export const emailListSchema = z
  .string()
  .max(5000)
  .transform((s, ctx) => {
    const { valid, invalid } = parseEmailList(s);
    if (invalid.length > 0) {
      ctx.addIssue({ code: "custom", message: `Keine gültige Firmen-E-Mail: ${invalid.join(", ")}` });
      return z.NEVER;
    }
    if (valid.length > MAX_INVITES_PER_REQUEST) {
      ctx.addIssue({ code: "custom", message: `Höchstens ${MAX_INVITES_PER_REQUEST} Adressen auf einmal.` });
      return z.NEVER;
    }
    return valid;
  });

export const onboardingSchema = z.object({
  name: workspaceNameSchema,
  color: z.enum(paletteHex, "Bitte eine Farbe aus der Palette wählen."),
  template: z.enum(TEMPLATE_IDS, "Bitte eine Vorlage wählen."),
  // prefault: the default goes through the transform, so the output is always string[].
  invites: emailListSchema.prefault(""),
  // Checkbox: present only when ticked → continue on the import page.
  thenImport: z.literal("on").optional(),
});

export const inviteSchema = z.object({
  emails: emailListSchema.refine((l) => l.length > 0, "Bitte mindestens eine Adresse eingeben."),
  role: z.enum(["admin", "member"]),
});

export const roleChangeSchema = z.object({
  membershipId: z.uuid(),
  role: z.enum(["admin", "member"]),
});
