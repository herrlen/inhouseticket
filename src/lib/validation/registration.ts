import { z } from "zod";
import { MAX_EMAIL, MAX_NAME, MAX_PASSWORD } from "@/lib/limits";
import { newPasswordSchema } from "@/lib/validation/password";

// Registration with name, address and password (ADR 005). Messages in German, translated at the
// server edge with t.validation() (see i18n).

/** Control and bidi characters would let a name pose as something else in lists and mails. */
const CONTROL = /[\p{Cc}\p{Cf}]/u;

export const registrationNameSchema = z
  .string("Bitte gib deinen Namen ein.")
  .trim()
  .min(1, "Bitte gib deinen Namen ein.")
  .max(MAX_NAME, `Höchstens ${MAX_NAME} Zeichen.`)
  .refine((v) => !CONTROL.test(v), "Der Name enthält unzulässige Zeichen.");

export const registrationEmailSchema = z
  .string("Das sieht nicht nach einer gültigen E-Mail-Adresse aus.")
  .trim()
  .toLowerCase()
  .max(MAX_EMAIL, "Das sieht nicht nach einer gültigen E-Mail-Adresse aus.")
  .pipe(z.email("Das sieht nicht nach einer gültigen E-Mail-Adresse aus."));

export const registerSchema = z
  .object({
    name: registrationNameSchema,
    email: registrationEmailSchema,
    password: newPasswordSchema,
    confirm: z.string("Ungültige Eingabe.").max(MAX_PASSWORD, `Höchstens ${MAX_PASSWORD} Zeichen.`),
  })
  .refine((v) => v.password === v.confirm, { message: "Die Passwörter stimmen nicht überein.", path: ["confirm"] });

/** The link token (base64url, 43 characters) and the password chosen at registration. */
export const confirmRegistrationSchema = z.object({
  token: z.string("Ungültiger Link.").regex(/^[A-Za-z0-9_-]{20,200}$/, "Ungültiger Link."),
  password: z.string("Ungültige Eingabe.").min(1, "Bitte gib dein Passwort ein.").max(MAX_PASSWORD, `Höchstens ${MAX_PASSWORD} Zeichen.`),
});
