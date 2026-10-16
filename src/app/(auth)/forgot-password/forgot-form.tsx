"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { getEmailDomain } from "@/lib/freemail";
import { useT } from "@/lib/i18n/client";

type State = { kind: "idle" } | { kind: "sending" } | { kind: "sent"; email: string } | { kind: "error"; message: string };

export function ForgotPasswordForm() {
  const t = useT();
  const [state, setState] = useState<State>({ kind: "idle" });
  const sentHeading = useRef<HTMLHeadingElement>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    if (!getEmailDomain(email)) return setState({ kind: "error", message: t.auth.invalidEmail });
    setState({ kind: "sending" });
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    // The answer is the same whether the address has an account or not.
    if (error && error.status === 429) return setState({ kind: "error", message: t.login.tooMany });
    if (error) return setState({ kind: "error", message: (error.status ?? 0) >= 500 ? t.login.mailFailed : t.password.failed });
    setState({ kind: "sent", email });
    requestAnimationFrame(() => sentHeading.current?.focus());
  }

  if (state.kind === "sent") {
    return (
      <div aria-live="polite">
        <h2 ref={sentHeading} tabIndex={-1} className="mb-2 font-semibold">
          {t.password.forgotSentTitle}
        </h2>
        <p className="mb-6 text-muted">{t.password.forgotSent(state.email)}</p>
        <Link href="/login" className="text-accent hover:underline">
          {t.password.backToLogin}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Input
        name="email"
        type="email"
        label={t.login.email}
        placeholder={t.login.emailPlaceholder}
        autoComplete="username"
        autoFocus
        required
        error={state.kind === "error" ? state.message : undefined}
      />
      <Button type="submit" variant="primary" disabled={state.kind === "sending"}>
        {state.kind === "sending" ? t.login.sending : t.password.forgotSubmit}
      </Button>
      <Link href="/login" className="text-[13px] text-accent hover:underline">
        {t.password.backToLogin}
      </Link>
    </form>
  );
}
