"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { NewPasswordFields, useNewPasswordCheck } from "@/components/account/new-password-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loginHref } from "@/lib/auth-links";
import { getEmailDomain } from "@/lib/freemail";
import { useT } from "@/lib/i18n/client";
import { MAX_NAME } from "@/lib/limits";
import { useHydrated } from "@/lib/use-hydrated";
import { registerAction, type RegisterState } from "./actions";
import deAuth from "@/lib/i18n/de/auth";
import deLegal from "@/lib/i18n/de/legal";
import deLogin from "@/lib/i18n/de/login";
import deRegister from "@/lib/i18n/de/register";

const MESSAGES = { auth: deAuth, legal: deLegal, login: deLogin, register: deRegister };

export function RegisterForm({ next, email }: { next: string; email?: string }) {
  const t = useT(MESSAGES);
  const hydrated = useHydrated();
  const [state, action, pending] = useActionState<RegisterState, FormData>(registerAction, {});
  const { local: passwordErrors, onSubmitCheck } = useNewPasswordCheck();
  const [local, setLocal] = useState<Record<string, string>>({});
  // "Use a different address" goes back to the form without a new round trip.
  const [dismissed, setDismissed] = useState<RegisterState | null>(null);
  const sentHeading = useRef<HTMLHeadingElement>(null);
  const showSent = Boolean(state.sent) && dismissed !== state;

  useEffect(() => {
    if (showSent) sentHeading.current?.focus();
  }, [showSent]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    // Quick checks in the browser (no Zod in client bundles); the server validates again.
    const data = new FormData(e.currentTarget);
    const problems: Record<string, string> = {};
    if (!String(data.get("name") ?? "").trim()) problems.name = t.register.nameMissing;
    if (!getEmailDomain(String(data.get("email") ?? ""))) problems.email = t.auth.invalidEmail;
    setLocal(problems);
    onSubmitCheck(e);
    if (Object.keys(problems).length > 0) e.preventDefault();
  }

  if (showSent) {
    return (
      <div aria-live="polite">
        <h2 ref={sentHeading} tabIndex={-1} className="mb-2 font-semibold">
          {t.register.sentTitle}
        </h2>
        <p className="mb-2 text-muted">{t.register.sentText(state.sent ?? "")}</p>
        <p className="mb-6 text-[13px] text-muted">{t.register.sentHint}</p>
        <Button variant="ghost" size="sm" onClick={() => setDismissed(state)}>
          {t.login.otherEmail}
        </Button>
      </div>
    );
  }

  // Server errors belong to the last submit; local ones replace them once the person retries.
  const errors: Record<string, string | undefined> = { ...(dismissed === state ? {} : state.errors), ...local, ...passwordErrors };
  const values = dismissed === state ? undefined : state.values;
  return (
    <div className="flex flex-col gap-4">
      {/* A form action posts even before hydration – the password never lands in the URL. */}
      <form action={action} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />
        <Input
          name="name"
          label={t.register.name}
          placeholder={t.register.namePlaceholder}
          autoComplete="name"
          autoFocus
          required
          maxLength={MAX_NAME}
          defaultValue={values?.name}
          error={errors.name}
        />
        <Input
          name="email"
          type="email"
          label={t.login.email}
          placeholder={t.login.emailPlaceholder}
          autoComplete="username"
          required
          defaultValue={values?.email ?? email}
          error={errors.email}
          hint={errors.email ? undefined : t.login.hint}
        />
        <NewPasswordFields errors={errors} label={t.register.passwordLabel} />
        <p className="text-xs text-muted">
          {t.register.termsBefore}
          <Link href="/agb" target="_blank" className="text-accent underline">{t.legal.terms}</Link>
          {t.register.termsBetween}
          <Link href="/datenschutz" target="_blank" className="text-accent underline">{t.register.termsPrivacy}</Link>
          {t.register.termsAfter}
        </p>
        {errors.form ? (
          <p role="alert" className="text-[13px] text-prio-urgent-ink">
            {errors.form}
          </p>
        ) : null}
        <Button type="submit" variant="primary" disabled={pending || !hydrated}>
          {pending ? t.register.submitting : t.register.submit}
        </Button>
      </form>
      <p className="text-[13px] text-muted">
        {t.register.haveAccount}{" "}
        <Link href={loginHref(next)} className="text-accent underline">
          {t.register.signIn}
        </Link>
      </p>
    </div>
  );
}
