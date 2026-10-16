import "server-only";
import { APIError } from "better-auth/api";
import type { z } from "zod";
import type { Messages } from "@/lib/i18n/de";
import { fieldErrors } from "@/lib/validation/password";

export type PasswordFormState = { errors?: Record<string, string>; done?: string };

/** Zod issues → translated messages per field (Zod messages are German, see i18n). */
export function translatedErrors(error: z.ZodError, t: Messages): Record<string, string> {
  return Object.fromEntries(Object.entries(fieldErrors(error)).map(([k, v]) => [k, t.validation(v)]));
}

/** Better Auth error code, if the thrown value is one of its API errors. */
export function authErrorCode(e: unknown): string | undefined {
  if (!(e instanceof APIError)) return undefined;
  const code: unknown = (e.body as { code?: unknown } | undefined)?.code;
  return typeof code === "string" ? code : undefined;
}
