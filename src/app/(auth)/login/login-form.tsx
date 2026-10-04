"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { getEmailDomain, isCompanyEmail } from "@/lib/freemail";
import { de } from "@/lib/i18n/de";

type State = { kind: "idle" } | { kind: "sending" } | { kind: "sent"; email: string } | { kind: "error"; message: string };

export function LoginForm({ next }: { next: string }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const sentHeading = useRef<HTMLHeadingElement>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    if (!getEmailDomain(email)) return setState({ kind: "error", message: de.auth.invalidEmail });
    if (!isCompanyEmail(email)) return setState({ kind: "error", message: de.auth.freemail });

    setState({ kind: "sending" });
    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL: next,
      errorCallbackURL: `/login?error=link&next=${encodeURIComponent(next)}`,
    });
    if (error) {
      setState({
        kind: "error",
        message:
          error.code === "FREEMAIL_NOT_ALLOWED"
            ? de.auth.freemail
            : error.code === "BETA_CLOSED"
              ? de.auth.betaClosed
              : error.status === 429
                ? de.login.tooMany
                : (error.status ?? 0) >= 500
                  ? de.login.mailFailed
                  : de.login.failed,
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
          {de.login.sentTitle}
        </h2>
        <p className="mb-6 text-muted">{de.login.sentText(state.email)}</p>
        <Button variant="ghost" size="sm" onClick={() => setState({ kind: "idle" })}>
          {de.login.otherEmail}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Input
        name="email"
        type="email"
        label={de.login.email}
        placeholder="vorname@firma.de"
        autoComplete="email"
        autoFocus
        required
        error={state.kind === "error" ? state.message : undefined}
        hint={state.kind === "error" ? undefined : de.login.hint}
      />
      <Button type="submit" variant="primary" disabled={state.kind === "sending"}>
        {state.kind === "sending" ? de.login.sending : de.login.submit}
      </Button>
    </form>
  );
}
