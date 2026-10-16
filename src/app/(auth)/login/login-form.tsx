"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { authClient } from "@/lib/auth-client";
import { getEmailDomain } from "@/lib/freemail";
import { useT } from "@/lib/i18n/client";

type State =
  | { kind: "idle" }
  | { kind: "signingIn" }
  | { kind: "sending" }
  | { kind: "sent"; email: string }
  | { kind: "error"; field: "email" | "password"; message: string };

export function LoginForm({ next }: { next: string }) {
  const t = useT();
  const [state, setState] = useState<State>({ kind: "idle" });
  const form = useRef<HTMLFormElement>(null);
  const sentHeading = useRef<HTMLHeadingElement>(null);
  const busy = state.kind === "signingIn" || state.kind === "sending";

  const emailOf = () => String(new FormData(form.current ?? undefined).get("email") ?? "").trim();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    if (!getEmailDomain(email)) return setState({ kind: "error", field: "email", message: t.auth.invalidEmail });
    if (!password) return setState({ kind: "error", field: "password", message: t.login.invalid });

    setState({ kind: "signingIn" });
    const { error } = await authClient.signIn.email({ email, password });
    if (error) {
      // One message for unknown address, wrong password and "no password yet" – no account enumeration.
      const message = error.status === 429 ? t.login.tooMany : (error.status ?? 0) >= 500 ? t.login.failed : t.login.invalid;
      return setState({ kind: "error", field: "password", message });
    }
    // Full navigation: `next` may be the OAuth authorize endpoint of a connector login.
    window.location.assign(next);
  }

  async function onMagicLink() {
    const email = emailOf();
    if (!getEmailDomain(email)) return setState({ kind: "error", field: "email", message: t.auth.invalidEmail });
    // Freemail is refused by the server (same message); it alone knows the operator exception.

    setState({ kind: "sending" });
    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL: next,
      errorCallbackURL: `/login?error=link&next=${encodeURIComponent(next)}`,
    });
    if (error) {
      setState({
        kind: "error",
        field: "email",
        message:
          error.code === "FREEMAIL_NOT_ALLOWED"
            ? t.auth.freemail
            : error.code === "BETA_CLOSED"
              ? t.auth.betaClosed
              : error.status === 429
                ? t.login.tooMany
                : (error.status ?? 0) >= 500
                  ? t.login.mailFailed
                  : t.login.failed,
      });
      return;
    }
    setState({ kind: "sent", email });
    requestAnimationFrame(() => sentHeading.current?.focus());
  }

  if (state.kind === "sent") {
    return (
      <div aria-live="polite">
        <h2 ref={sentHeading} tabIndex={-1} className="mb-2 font-semibold">
          {t.login.sentTitle}
        </h2>
        <p className="mb-6 text-muted">{t.login.sentText(state.email)}</p>
        <Button variant="ghost" size="sm" onClick={() => setState({ kind: "idle" })}>
          {t.login.otherEmail}
        </Button>
      </div>
    );
  }

  const error = state.kind === "error" ? state : null;
  return (
    <div className="flex flex-col gap-4">
      <form ref={form} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Input
          name="email"
          type="email"
          label={t.login.email}
          placeholder={t.login.emailPlaceholder}
          autoComplete="username"
          autoFocus
          required
          error={error?.field === "email" ? error.message : undefined}
          hint={error?.field === "email" ? undefined : t.login.hint}
        />
        <div className="flex flex-col gap-1">
          <PasswordInput
            name="password"
            label={t.password.label}
            autoComplete="current-password"
            required
            error={error?.field === "password" ? error.message : undefined}
          />
          <Link href="/forgot-password" className="self-end text-[13px] text-accent hover:underline">
            {t.password.forgotLink}
          </Link>
        </div>
        <Button type="submit" variant="primary" disabled={busy}>
          {state.kind === "signingIn" ? t.login.signingIn : t.login.submit}
        </Button>
      </form>
      <p className="flex items-center gap-3 text-xs text-muted" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        {t.login.or}
        <span className="h-px flex-1 bg-border" />
      </p>
      <div className="flex flex-col gap-1">
        <Button variant="secondary" onClick={() => void onMagicLink()} disabled={busy}>
          {state.kind === "sending" ? t.login.sending : t.login.linkSubmit}
        </Button>
        <p className="text-xs text-muted">{t.login.linkHint}</p>
      </div>
    </div>
  );
}
