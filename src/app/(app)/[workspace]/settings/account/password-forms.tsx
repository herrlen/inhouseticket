"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { NewPasswordFields, useNewPasswordCheck } from "@/components/account/new-password-fields";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { MAX_PASSWORD } from "@/lib/limits";
import { useT } from "@/lib/i18n/client";
import type { PasswordFormState } from "@/lib/password-actions";
import { changePasswordAction, disconnectAllAction, sendResetLinkAction, type DisconnectAllState, type ResetLinkState } from "./actions";

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

/** Two steps (button, then confirm) – it cuts scripts and connectors off at once. */
export function DisconnectAllButton() {
  const t = useT();
  const [state, action, pending] = useActionState<DisconnectAllState>(disconnectAllAction, {});
  const [confirming, setConfirming] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  // Focus follows the step: onto "Ja, trennen" when it appears, back to the start button after.
  const moveFocus = useRef(false);
  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    (confirming ? confirmRef : startRef).current?.focus();
  }, [confirming]);
  const step = (next: boolean) => {
    moveFocus.current = true;
    setConfirming(next);
  };
  return (
    <form
      action={() => {
        step(false);
        action();
      }}
      className="flex flex-col items-start gap-2"
    >
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px]">{t.account.disconnectAllConfirm}</span>
          <Button ref={confirmRef} type="submit" variant="danger" disabled={pending}>
            {t.account.disconnectAllYes}
          </Button>
          <Button type="button" variant="ghost" onClick={() => step(false)} disabled={pending}>
            {t.common.cancel}
          </Button>
        </div>
      ) : (
        <Button ref={startRef} type="button" variant="danger" onClick={() => step(true)} disabled={pending}>
          {pending ? t.account.disconnectAllPending : t.account.disconnectAllButton}
        </Button>
      )}
      <p aria-live="polite" className="text-[13px]">
        {state.error ? <span className="text-prio-urgent-ink">{state.error}</span> : (state.done ?? null)}
      </p>
    </form>
  );
}
