"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { trackEvent } from "@/lib/analytics";
import { useT } from "@/lib/i18n/client";
import { MAX_PASSWORD } from "@/lib/limits";
import { confirmRegistrationAction, type ConfirmState } from "./actions";
import dePassword from "@/lib/i18n/de/password";
import deRegister from "@/lib/i18n/de/register";

const MESSAGES = { password: dePassword, register: deRegister };

const linkButton = "inline-flex h-9 items-center rounded-[var(--radius-badge)] px-3.5 font-medium";

/** The link can't be used (any more): say why and offer the ways on. */
export function GoneNotice({ kind }: { kind: NonNullable<ConfirmState["gone"]> }) {
  const t = useT(MESSAGES);
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const text = kind === "locked" ? t.register.locked : kind === "accountExists" ? t.register.accountExists : t.register.invalid;
  return (
    <div className="flex flex-col gap-4">
      <p ref={ref} tabIndex={-1} role="alert" className="text-prio-urgent-ink">
        {text}
      </p>
      <div className="flex flex-wrap gap-2">
        {kind === "accountExists" ? null : (
          <Link href="/register" className={`${linkButton} bg-accent text-accent-contrast`}>
            {t.register.registerAgain}
          </Link>
        )}
        <Link href="/login" className={`${linkButton} ${kind === "accountExists" ? "bg-accent text-accent-contrast" : "border border-border text-text hover:bg-bg"}`}>
          {t.register.toLogin}
        </Link>
      </div>
    </div>
  );
}

/** Intro, address and password form – or why the link can't be used. */
export function ConfirmRegistration({ token, email }: { token: string; email: string | null }) {
  const t = useT(MESSAGES);
  const [state, action, pending] = useActionState<ConfirmState, FormData>(confirmRegistrationAction, {});
  const password = useRef<HTMLInputElement>(null);

  // The token stays in the form only: drop it from the address bar and browser history.
  useEffect(() => {
    window.history.replaceState(null, "", "/register/confirm");
  }, []);
  // Full navigation: the target may be a connector's OAuth authorize URL (a route handler).
  useEffect(() => {
    if (!state.done) return;
    trackEvent("Account", "Signup completed");
    window.location.assign(state.done);
  }, [state.done]);
  useEffect(() => {
    if (state.attempt) password.current?.focus();
  }, [state.attempt]);

  if (state.gone) return <GoneNotice kind={state.gone} />;
  if (!email && !state.done) return <GoneNotice kind="invalid" />;

  return (
    <>
      <p className="mb-1 text-muted">{t.register.confirmIntro}</p>
      {email ? <p className="mb-6 text-[13px] font-medium">{t.register.confirmFor(email)}</p> : null}
      <form action={action} noValidate className="flex flex-col gap-4">
        <input type="hidden" name="token" value={token} />
        {/* Lets password managers fill the password stored for this address. */}
        <input type="email" name="username" autoComplete="username" value={email ?? ""} readOnly hidden />
        <PasswordInput
          ref={password}
          name="password"
          label={t.password.label}
          autoComplete="current-password"
          autoFocus
          required
          maxLength={MAX_PASSWORD}
          error={state.errors?.password}
          hint={t.register.wrongPasswordHint}
        />
        {state.errors?.form ? (
          <p role="alert" className="text-[13px] text-prio-urgent-ink">
            {state.errors.form}
          </p>
        ) : null}
        {state.attempt ? (
          <p key={state.attempt} role="alert" className="sr-only">
            {state.errors?.password}
          </p>
        ) : null}
        <Button type="submit" variant="primary" disabled={pending || Boolean(state.done)}>
          {pending || state.done ? t.register.confirming : t.register.confirmSubmit}
        </Button>
      </form>
    </>
  );
}
