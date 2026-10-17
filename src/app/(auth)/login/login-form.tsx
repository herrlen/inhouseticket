"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { authClient } from "@/lib/auth-client";
import { getEmailDomain } from "@/lib/freemail";
import { useT } from "@/lib/i18n/client";
import { useHydrated } from "@/lib/use-hydrated";

type State =
  | { kind: "idle" }
  | { kind: "signingIn" }
  | { kind: "sending" }
  | { kind: "sent"; email: string }
  | { kind: "error"; field: "email" | "password"; message: string };

/** Failed password sign-in: a visible box; `attempt` re-announces and re-animates it each time. */
type Failure = { lead: string; hint?: string; attempt: number };

export function LoginForm({ next }: { next: string }) {
  const t = useT();
  const hydrated = useHydrated();
  const [state, setState] = useState<State>({ kind: "idle" });
  const [failure, setFailure] = useState<Failure | null>(null);
  const attempts = useRef(0);
  const form = useRef<HTMLFormElement>(null);
  const password = useRef<HTMLInputElement>(null);
  const sentHeading = useRef<HTMLHeadingElement>(null);
  const busy = state.kind === "signingIn" || state.kind === "sending";

  const emailOf = () => String(new FormData(form.current ?? undefined).get("email") ?? "").trim();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const secret = String(data.get("password") ?? "");
    setFailure(null);
    if (!getEmailDomain(email)) return setState({ kind: "error", field: "email", message: t.auth.invalidEmail });
    if (!secret) return setState({ kind: "error", field: "password", message: t.login.passwordMissing });

    setState({ kind: "signingIn" });
    const { error } = await authClient.signIn.email({ email, password: secret });
    if (error) {
      // One answer for unknown address, wrong password and "no password yet" – no account
      // enumeration. In the last case the server has quietly mailed a sign-in link.
      const invalid = error.status !== 429 && (error.status ?? 0) < 500;
      if (password.current) password.current.value = "";
      password.current?.focus();
      attempts.current += 1;
      setFailure({
        lead: error.status === 429 ? t.login.tooMany : invalid ? t.login.invalid : t.login.failed,
        hint: invalid ? t.login.invalidHint : undefined,
        attempt: attempts.current,
      });
      return setState({ kind: "idle" });
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
    setFailure(null);
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
      {/* method="post": a submit before hydration never puts the password into the URL. */}
      <form ref={form} method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
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
            ref={password}
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
        {failure ? (
          <div className="flex flex-col gap-2">
            <div
              key={failure.attempt}
              role="alert"
              className="animate-nudge rounded-[var(--radius-badge)] border border-prio-urgent-ink bg-surface p-3 text-[13px]"
            >
              <p className="font-semibold text-prio-urgent-ink">{failure.lead}</p>
              {failure.hint ? <p className="mt-1 text-text">{failure.hint}</p> : null}
            </div>
            <Button variant="secondary" onClick={() => void onMagicLink()} disabled={busy}>
              {state.kind === "sending" ? t.login.sending : t.login.linkToAddress}
            </Button>
          </div>
        ) : null}
        <Button type="submit" variant="primary" disabled={busy || !hydrated}>
          {state.kind === "signingIn" ? t.login.signingIn : t.login.submit}
        </Button>
      </form>
      <p className="flex items-center gap-3 text-xs text-muted" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        {t.login.or}
        <span className="h-px flex-1 bg-border" />
      </p>
      <div className="flex flex-col gap-1">
        <Button variant="secondary" onClick={() => void onMagicLink()} disabled={busy || !hydrated}>
          {state.kind === "sending" && !failure ? t.login.sending : t.login.linkSubmit}
        </Button>
        <p className="text-xs text-muted">{t.login.linkHint}</p>
      </div>
    </div>
  );
}
