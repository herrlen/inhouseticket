import { z } from "zod";
import { MAX_PROJECT_KEY, PROJECT_KEY_PATTERN } from "@/lib/limits";
import { PALETTE } from "@/lib/palette";

const paletteHex = Object.values(PALETTE) as [string, ...string[]];

export const projectNameSchema = z.string().trim().min(1, "Bitte einen Namen eingeben.").max(100, "Höchstens 100 Zeichen.");

export const projectKeySchema = z
  .string()
  .trim()
  .toUpperCase()
  .max(MAX_PROJECT_KEY, `Höchstens ${MAX_PROJECT_KEY} Zeichen.`)
  .regex(PROJECT_KEY_PATTERN, "2–10 Zeichen, Großbuchstaben und Ziffern, beginnt mit einem Buchstaben.");

export const projectColorSchema = z.enum(paletteHex, "Bitte eine Farbe aus der Palette wählen.");

/** One emoji or empty. Grapheme-based, so flags and skin tones count as one. */
export const projectIconSchema = z
  .string()
  .trim()
  .max(16)
  .refine((s) => s === "" || ([...new Intl.Segmenter("de", { granularity: "grapheme" }).segment(s)].length === 1 && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(s)), "Bitte genau ein Emoji.")
  .transform((s) => s || null);

export const createProjectSchema = z.object({
  name: projectNameSchema,
  key: projectKeySchema,
  color: projectColorSchema,
  icon: projectIconSchema.prefault(""),
  folderId: z.union([z.uuid(), z.literal("")]).transform((v) => v || null).prefault(""),
});

export const updateProjectSchema = z.object({
  name: projectNameSchema,
  color: projectColorSchema,
  icon: projectIconSchema.prefault(""),
});

export const folderNameSchema = z.string().trim().min(1, "Bitte einen Namen eingeben.").max(100, "Höchstens 100 Zeichen.");

export const statusSchema = z.object({
  name: z.string().trim().min(1, "Bitte einen Namen eingeben.").max(50, "Höchstens 50 Zeichen."),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Ungültige Farbe."),
  category: z.enum(["open", "active", "done"]),
  /** Empty = no limit. */
  wipLimit: z
    .union([z.literal(""), z.coerce.number().int("Ganze Zahl.").min(1, "Mindestens 1.").max(999, "Höchstens 999.")])
    .transform((v) => (v === "" ? null : v))
    .prefault(""),
});
