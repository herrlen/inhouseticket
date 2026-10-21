"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { NewPasswordFields, useNewPasswordCheck } from "@/components/account/new-password-fields";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import type { PasswordFormState } from "@/lib/password-actions";
import { resetPasswordAction } from "./actions";
import dePassword from "@/lib/i18n/de/password";

const MESSAGES = { password: dePassword };

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useT(MESSAGES);
  const [state, action, pending] = useActionState<PasswordFormState, FormData>(resetPasswordAction, {});
  const { local, onSubmitCheck } = useNewPasswordCheck();
  const doneRef = useRef<HTMLParagraphElement>(null);

  // The token stays in the form only: drop it from the address bar and browser history.
  useEffect(() => {
    window.history.replaceState(null, "", "/reset-password");
  }, []);
  useEffect(() => {
    if (state.done) doneRef.current?.focus();
  }, [state.done]);

  if (state.done) {
    return (
      <div aria-live="polite">
        <p ref={doneRef} tabIndex={-1} className="mb-6">
          {t.password.resetDone}
        </p>
        <Link href={state.done} className="inline-flex h-9 items-center rounded-[var(--radius-badge)] bg-accent px-3.5 font-medium text-accent-contrast">
          {t.password.toLogin}
        </Link>
      </div>
    );
  }

  return (
    <form action={action} onSubmit={onSubmitCheck} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <NewPasswordFields errors={{ ...state.errors, ...local }} autoFocus />
      {state.errors?.form ? (
        <div role="alert" className="flex flex-col gap-2 text-[13px] text-prio-urgent-ink">
          <p>{state.errors.form}</p>
          <Link href="/forgot-password" className="text-accent hover:underline">
            {t.password.resetRequestNew}
          </Link>
        </div>
      ) : null}
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? t.password.saving : t.password.resetSubmit}
      </Button>
    </form>
  );
}
