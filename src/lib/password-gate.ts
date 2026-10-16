// Every person has a password (Len, 2026-10-16). Who signs in by link without one is sent here
// first – enforced on the server in requireUser(), requireApiMember() and before the OAuth
// authorize endpoint. Pure, so it is unit-tested and usable in client components.
import { MAX_PASSWORD, MIN_PASSWORD } from "@/lib/limits";

export const SET_PASSWORD_PATH = "/set-password";

/** The set-password page, continuing to `next` (a same-origin path the caller already checked). */
export function setPasswordUrl(next: string): string {
  return next === "/start" ? SET_PASSWORD_PATH : `${SET_PASSWORD_PATH}?next=${encodeURIComponent(next)}`;
}

export type PasswordProblem = "tooShort" | "tooLong" | "mismatch";

/** Quick check in the browser (no Zod in client bundles); the server validates again with Zod. */
export function checkNewPassword(password: string, confirm: string): PasswordProblem | null {
  if (password.length < MIN_PASSWORD) return "tooShort";
  if (password.length > MAX_PASSWORD) return "tooLong";
  if (password !== confirm) return "mismatch";
  return null;
}
