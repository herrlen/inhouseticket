"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { authErrorCode, translatedErrors, type PasswordFormState } from "@/lib/password-actions";
import { getSession } from "@/lib/session";
import { resetPasswordSchema } from "@/lib/validation/password";

/** New password from a reset link. Better Auth consumes the token (single use) and ends all sessions. */
export async function resetPasswordAction(_: PasswordFormState, formData: FormData): Promise<PasswordFormState> {
  const t = await getT();
  const parsed = resetPasswordSchema.safeParse({ token: formData.get("token"), password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) {
    const errors = translatedErrors(parsed.error, t);
    return { errors: errors.token ? { form: t.password.resetInvalid } : errors };
  }

  try {
    await auth.api.resetPassword({ body: { newPassword: parsed.data.password, token: parsed.data.token } });
  } catch (e) {
    const code = authErrorCode(e);
    if (code === "INVALID_TOKEN" || code === "USER_NOT_FOUND") return { errors: { form: t.password.resetInvalid } };
    console.error("reset-password failed", code ?? "unknown");
    return { errors: { form: t.password.failed } };
  }
  // All sessions are gone in the database; also drop this browser's cookie (and its 5-minute cache).
  if (await getSession()) await auth.api.signOut({ headers: await headers() });
  return { done: "/login" };
}
