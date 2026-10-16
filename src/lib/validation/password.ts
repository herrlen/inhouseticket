import { z } from "zod";
import { MAX_PASSWORD, MIN_PASSWORD } from "@/lib/limits";

// Passwords are never trimmed: leading or trailing spaces are part of what the person typed.
export const newPasswordSchema = z
  .string("Ungültige Eingabe.")
  .min(MIN_PASSWORD, `Mindestens ${MIN_PASSWORD} Zeichen.`)
  .max(MAX_PASSWORD, `Höchstens ${MAX_PASSWORD} Zeichen.`);

const MISMATCH = "Die Passwörter stimmen nicht überein.";

/** First password of a person (after the magic link) and the new one from a reset link. */
export const setPasswordSchema = z
  .object({ password: newPasswordSchema, confirm: z.string("Ungültige Eingabe.").max(MAX_PASSWORD, `Höchstens ${MAX_PASSWORD} Zeichen.`) })
  .refine((v) => v.password === v.confirm, { message: MISMATCH, path: ["confirm"] });

export const resetPasswordSchema = z
  .object({
    token: z.string("Ungültiger Link.").min(1, "Ungültiger Link.").max(200, "Ungültiger Link."),
    password: newPasswordSchema,
    confirm: z.string("Ungültige Eingabe.").max(MAX_PASSWORD, `Höchstens ${MAX_PASSWORD} Zeichen.`),
  })
  .refine((v) => v.password === v.confirm, { message: MISMATCH, path: ["confirm"] });

export const changePasswordSchema = z
  .object({
    current: z.string("Ungültige Eingabe.").min(1, "Bitte das aktuelle Passwort eingeben.").max(MAX_PASSWORD, `Höchstens ${MAX_PASSWORD} Zeichen.`),
    password: newPasswordSchema,
    confirm: z.string("Ungültige Eingabe.").max(MAX_PASSWORD, `Höchstens ${MAX_PASSWORD} Zeichen.`),
  })
  .refine((v) => v.password === v.confirm, { message: MISMATCH, path: ["confirm"] })
  .refine((v) => v.password !== v.current, { message: "Das neue Passwort muss sich vom aktuellen unterscheiden.", path: ["password"] });

/** Field → first message, for forms that show errors next to each field. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[String(issue.path[0] ?? "form")] ??= issue.message;
  return out;
}
