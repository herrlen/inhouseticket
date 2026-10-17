"use server";

import { headers } from "next/headers";
import { revokeAllConnections } from "@/db/queries/connections";
import { auth } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { authErrorCode, translatedErrors, type PasswordFormState } from "@/lib/password-actions";
import { rateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import { changePasswordSchema } from "@/lib/validation/password";

/** Wrong current passwords per person – the endpoint must not become a guessing oracle. */
const CHANGES_PER_WINDOW = 5;
const RESET_MAILS_PER_WINDOW = 3;
const WINDOW_MS = 15 * 60_000;

export type ResetLinkState = { sent?: string; error?: string };
export type DisconnectAllState = { done?: string; error?: string };

/** Change with the current password; all other sessions of the person end, this one continues. */
export async function changePasswordAction(_: PasswordFormState, formData: FormData): Promise<PasswordFormState> {
  const t = await getT();
  const user = await requireUser();
  const parsed = changePasswordSchema.safeParse({ current: formData.get("current"), password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { errors: translatedErrors(parsed.error, t) };
  if (!rateLimit(`change-password:${user.id}`, CHANGES_PER_WINDOW, WINDOW_MS).ok) return { errors: { form: t.account.tooMany } };

  try {
    await auth.api.changePassword({
      body: { currentPassword: parsed.data.current, newPassword: parsed.data.password, revokeOtherSessions: true },
      headers: await headers(),
    });
  } catch (e) {
    const code = authErrorCode(e);
    if (code === "INVALID_PASSWORD") return { errors: { current: t.account.wrongCurrent } };
    console.error("change-password failed", code ?? "unknown");
    return { errors: { form: t.password.failed } };
  }
  return { done: t.account.changed };
}

/** "Passwort zurücksetzen": a reset link to the person's own address – never to one from the form. */
export async function sendResetLinkAction(): Promise<ResetLinkState> {
  const t = await getT();
  const user = await requireUser();
  if (!rateLimit(`reset-mail:${user.id}`, RESET_MAILS_PER_WINDOW, WINDOW_MS).ok) return { error: t.account.tooMany };
  try {
    await auth.api.requestPasswordReset({ body: { email: user.email, redirectTo: "/reset-password" }, headers: await headers() });
  } catch (e) {
    console.error("reset-mail failed", authErrorCode(e) ?? "unknown");
    return { error: t.login.mailFailed };
  }
  return { sent: t.account.resetSent(user.email) };
}

/** "Alle Verbindungen trennen": every API token and connector (OAuth) access of the person ends now. */
export async function disconnectAllAction(): Promise<DisconnectAllState> {
  const t = await getT();
  const user = await requireUser();
  if (!rateLimit(`disconnect-all:${user.id}`, CHANGES_PER_WINDOW, WINDOW_MS).ok) return { error: t.account.tooMany };
  const { apiTokens, oauthClients } = await revokeAllConnections(user.id);
  return { done: t.account.disconnectAllDone(apiTokens, oauthClients) };
}
