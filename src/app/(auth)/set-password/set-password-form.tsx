"use client";

import { useActionState, useEffect } from "react";
import { NewPasswordFields, useNewPasswordCheck } from "@/components/account/new-password-fields";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import type { PasswordFormState } from "@/lib/password-actions";
import { setPasswordAction } from "./actions";

export function SetPasswordForm({ email, next }: { email: string; next: string }) {
  const t = useT();
  const [state, action, pending] = useActionState<PasswordFormState, FormData>(setPasswordAction, {});
  const { local, onSubmitCheck } = useNewPasswordCheck();
  const errors = { ...state.errors, ...local };

  // Full navigation: the target may be a connector's OAuth authorize URL (a route handler).
  useEffect(() => {
    if (state.done) window.location.assign(state.done);
  }, [state.done]);

  return (
    <form action={action} onSubmit={onSubmitCheck} noValidate className="flex flex-col gap-4">
      {/* Lets password managers store the new password under the right address. */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <input type="hidden" name="next" value={next} />
      <NewPasswordFields errors={errors} autoFocus />
      {state.errors?.form ? (
        <p role="alert" className="text-[13px] text-prio-urgent-ink">
          {state.errors.form}
        </p>
      ) : null}
      <Button type="submit" variant="primary" disabled={pending || Boolean(state.done)}>
        {pending ? t.password.saving : t.password.setSubmit}
      </Button>
    </form>
  );
}
