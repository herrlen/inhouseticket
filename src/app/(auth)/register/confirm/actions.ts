"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { closedMessage } from "@/lib/beta";
import { env } from "@/lib/env";
import { getT } from "@/lib/i18n/server";
import { authErrorCode, translatedErrors } from "@/lib/password-actions";
import { clientIp, takeConfirmAttempt } from "@/lib/registration";
import { confirmRegistrationSchema } from "@/lib/validation/registration";

/** "gone": the link can no longer be used – the form gives way to a message with links. */
export type ConfirmState = {
  errors?: { password?: string; form?: string };
  /** Bumped per wrong password, so the message is announced again each time. */
  attempt?: number;
  gone?: "invalid" | "locked" | "accountExists";
  done?: string;
};

/** Completes a registration: link token + the password chosen at registration (ADR 005). */
export async function confirmRegistrationAction(prev: ConfirmState, formData: FormData): Promise<ConfirmState> {
  const t = await getT();
  const parsed = confirmRegistrationSchema.safeParse({ token: formData.get("token"), password: formData.get("password") });
  if (!parsed.success) {
    const errors = translatedErrors(parsed.error, t);
    return errors.token ? { gone: "invalid" } : { errors: { password: errors.password } };
  }
  if (env.NODE_ENV === "production" && !takeConfirmAttempt(clientIp(await headers()))) return { errors: { form: t.login.tooMany } };

  try {
    // Server-only Better Auth endpoint: creates the user and sets the session cookie.
    const { next } = await auth.api.confirmRegistration({ body: parsed.data, headers: await headers() });
    return { done: next };
  } catch (e) {
    const code = authErrorCode(e);
    if (code === "WRONG_PASSWORD") return { errors: { password: `${t.register.wrongPassword} ${t.register.wrongPasswordHint}` }, attempt: (prev.attempt ?? 0) + 1 };
    if (code === "LOCKED") return { gone: "locked" };
    if (code === "INVALID_TOKEN") return { gone: "invalid" };
    if (code === "ACCOUNT_EXISTS") return { gone: "accountExists" };
    if (code === "FREEMAIL_NOT_ALLOWED") return { errors: { form: t.auth.freemail } };
    if (code === "BETA_CLOSED") return { errors: { form: closedMessage(t) } };
    console.error("register: confirm failed", code ?? (e instanceof Error ? e.name : "unknown"));
    return { errors: { form: t.login.failed } };
  }
}
