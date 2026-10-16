"use client";

import { useActionState } from "react";
import { NewPasswordFields, useNewPasswordCheck } from "@/components/account/new-password-fields";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { MAX_PASSWORD } from "@/lib/limits";
import { useT } from "@/lib/i18n/client";
import type { PasswordFormState } from "@/lib/password-actions";
import { changePasswordAction, sendResetLinkAction, type ResetLinkState } from "./actions";

export function ChangePasswordForm({ email }: { email: string }) {
  const t = useT();
  const [state, action, pending] = useActionState<PasswordFormState, FormData>(changePasswordAction, {});
  const { local, onSubmitCheck } = useNewPasswordCheck();
  const errors: Record<string, string | undefined> = { ...state.errors, ...local };

  return (
    // React resets the form after the action, so no password stays in the fields.
    <form action={action} onSubmit={onSubmitCheck} noValidate className="flex max-w-sm flex-col gap-4">
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <PasswordInput name="current" label={t.password.currentLabel} autoComplete="current-password" maxLength={MAX_PASSWORD} required error={errors.current} />
      <NewPasswordFields errors={errors} />
      <p aria-live="polite" className="text-[13px]">
        {state.errors?.form ? <span className="text-prio-urgent-ink">{state.errors.form}</span> : state.done && !pending ? state.done : null}
      </p>
      <div>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? t.password.saving : t.account.changeSubmit}
        </Button>
      </div>
    </form>
  );
}

export function ResetPasswordButton() {
  const t = useT();
  const [state, action, pending] = useActionState<ResetLinkState>(sendResetLinkAction, {});
  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <Button type="submit" disabled={pending}>
        {pending ? t.login.sending : t.account.resetButton}
      </Button>
      <p aria-live="polite" className="text-[13px]">
        {state.error ? <span className="text-prio-urgent-ink">{state.error}</span> : (state.sent ?? null)}
      </p>
    </form>
  );
}
