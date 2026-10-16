"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { authErrorCode, translatedErrors, type PasswordFormState } from "@/lib/password-actions";
import { hasPassword, requireUser, safeNext } from "@/lib/session";
import { setPasswordSchema } from "@/lib/validation/password";

/** First password after a link sign-in. Continues to `next` (the client navigates, it may be OAuth). */
export async function setPasswordAction(_: PasswordFormState, formData: FormData): Promise<PasswordFormState> {
  const t = await getT();
  const user = await requireUser("/set-password", { allowWithoutPassword: true });
  const next = safeNext(String(formData.get("next") ?? ""));
  const parsed = setPasswordSchema.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { errors: translatedErrors(parsed.error, t) };
  if (await hasPassword(user.id)) return { done: next };

  try {
    await auth.api.setPassword({ body: { newPassword: parsed.data.password }, headers: await headers() });
  } catch (e) {
    if (authErrorCode(e) === "PASSWORD_ALREADY_SET") return { done: next };
    console.error("set-password failed", authErrorCode(e) ?? "unknown");
    return { errors: { form: t.password.failed } };
  }
  return { done: next };
}
