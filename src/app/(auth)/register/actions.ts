"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { passwordStateByEmail } from "@/db/queries/credentials";
import { deleteExpiredRegistrations, upsertPendingRegistration } from "@/db/queries/registrations";
import { auth } from "@/lib/auth";
import { closedMessage, mayEnterBeta } from "@/lib/beta";
import { env } from "@/lib/env";
import { isCompanyEmail } from "@/lib/freemail";
import type { Messages } from "@/lib/i18n/de";
import { getT } from "@/lib/i18n/server";
import { MAX_NEXT_PATH } from "@/lib/limits";
import { buttonMail, sendMail } from "@/lib/mail";
import { translatedErrors } from "@/lib/password-actions";
import { clientIp, confirmRegistrationUrl, registrationExpiresAt, takeAccountExistsMail, takeRegistrationRequest } from "@/lib/registration";
import { safeNext } from "@/lib/safe-next";
import { isExemptEmail } from "@/lib/superadmin";
import { hashToken, newToken } from "@/lib/tokens";
import { registerSchema } from "@/lib/validation/registration";

export type RegisterState = {
  errors?: Record<string, string>;
  /** Typed values, so the form keeps them after a rejected submit (React resets it). */
  values?: { name: string; email: string };
  sent?: string;
};

type Registration = { name: string; email: string; password: string; next: string | null };

/**
 * Registration with name, address and password (ADR 005). The answer is the same whether the
 * address already has an account or not – the work behind it (hash, lookup, row, mail) runs
 * after the response, so neither content nor timing tells the two apart. No user is created here.
 */
export async function registerAction(_: RegisterState, formData: FormData): Promise<RegisterState> {
  const t = await getT();
  const values = { name: String(formData.get("name") ?? ""), email: String(formData.get("email") ?? "") };
  const parsed = registerSchema.safeParse({ ...values, password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { errors: translatedErrors(parsed.error, t), values };
  const { name, email, password } = parsed.data;

  // Same rules and messages as the sign-in link (CLAUDE.md rule 3).
  if (!isCompanyEmail(email) && !isExemptEmail(email)) return { errors: { email: t.auth.freemail }, values };
  // Production only, like the other per-address limits (local and E2E runs share one IP).
  if (env.NODE_ENV === "production" && !takeRegistrationRequest(clientIp(await headers()), email)) {
    return { errors: { form: t.login.tooMany }, values };
  }
  if (!(await mayEnterBeta(email))) return { errors: { email: closedMessage(t) }, values };

  const target = safeNext(String(formData.get("next") ?? ""));
  const next = target === "/start" || target.length > MAX_NEXT_PATH ? null : target;
  after(() => processRegistration({ name, email, password, next }, t));
  return { sent: email };
}

async function processRegistration(reg: Registration, t: Messages): Promise<void> {
  try {
    // Opportunistic retention cleanup (the server's scheduler does it too).
    await deleteExpiredRegistrations();
    if ((await passwordStateByEmail(reg.email)) !== "noAccount") {
      if (env.NODE_ENV === "production" && !takeAccountExistsMail(reg.email)) return;
      const m = t.register.existsMail;
      const loginUrl = new URL("/login", env.APP_URL).toString();
      const outro = m.outro(new URL("/forgot-password", env.APP_URL).toString());
      await sendMail({
        to: reg.email,
        subject: m.subject,
        text: `${m.intro}\n\n${loginUrl}\n\n${outro}`,
        html: buttonMail({ heading: m.heading, intro: m.intro, button: m.button, url: loginUrl, outro, lang: t.common.langTag, fallback: t.common.mailFallback }),
      });
      return;
    }

    // Better Auth's configured hasher (Argon2id, src/lib/password-hash.ts) – the hash moves unchanged into the credential account.
    const passwordHash = await (await auth.$context).password.hash(reg.password);
    const token = newToken();
    await upsertPendingRegistration({
      email: reg.email,
      name: reg.name,
      passwordHash,
      tokenHash: hashToken(token),
      next: reg.next,
      expiresAt: registrationExpiresAt(),
    });
    // The link carries the token: never log it.
    const url = confirmRegistrationUrl(env.APP_URL, token);
    const m = t.register.mail;
    await sendMail({
      to: reg.email,
      subject: m.subject,
      text: `${m.intro}\n\n${url}\n\n${m.outro}`,
      html: buttonMail({ heading: m.heading, intro: m.intro, button: m.button, url, outro: m.outro, lang: t.common.langTag, fallback: t.common.mailFallback }),
    });
  } catch (e) {
    // Never log the address or the token.
    console.error("register: not completed", e instanceof Error ? e.name : "unknown");
  }
}
