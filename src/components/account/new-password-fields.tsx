"use client";

import { useState } from "react";
import { PasswordInput } from "@/components/ui/password-input";
import { MAX_PASSWORD, MIN_PASSWORD } from "@/lib/limits";
import { useT } from "@/lib/i18n/client";
import { checkNewPassword } from "@/lib/password-gate";

export type PasswordErrors = { password?: string; confirm?: string };

/**
 * New password + repetition, shared by set, reset and change. `onSubmitCheck` runs the quick
 * browser check and cancels the submit on a problem; the server validates again with Zod.
 */
export function useNewPasswordCheck() {
  const t = useT();
  const [local, setLocal] = useState<PasswordErrors>({});
  function onSubmitCheck(e: React.FormEvent<HTMLFormElement>) {
    const data = new FormData(e.currentTarget);
    const problem = checkNewPassword(String(data.get("password") ?? ""), String(data.get("confirm") ?? ""));
    const next: PasswordErrors =
      problem === "tooShort"
        ? { password: t.password.tooShort(MIN_PASSWORD) }
        : problem === "tooLong"
          ? { password: t.password.tooLong(MAX_PASSWORD) }
          : problem === "mismatch"
            ? { confirm: t.password.mismatch }
            : {};
    setLocal(next);
    if (problem) e.preventDefault();
  }
  return { local, onSubmitCheck };
}

export function NewPasswordFields({ errors, autoFocus }: { errors: PasswordErrors; autoFocus?: boolean }) {
  const t = useT();
  return (
    <>
      <PasswordInput
        name="password"
        label={t.password.newLabel}
        autoComplete="new-password"
        autoFocus={autoFocus}
        maxLength={MAX_PASSWORD}
        required
        hint={t.password.hint(MIN_PASSWORD)}
        error={errors.password}
      />
      <PasswordInput name="confirm" label={t.password.confirmLabel} autoComplete="new-password" maxLength={MAX_PASSWORD} required error={errors.confirm} />
    </>
  );
}
