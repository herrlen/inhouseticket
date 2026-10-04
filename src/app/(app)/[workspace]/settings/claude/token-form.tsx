"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { de } from "@/lib/i18n/de";
import { createTokenAction, type TokenState } from "./actions";

export function TokenForm({ workspaceId, onToken }: { workspaceId: string; onToken?: (token: string) => void }) {
  const [state, action, pending] = useActionState<TokenState, FormData>(createTokenAction, {});
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.token) {
      form.current?.reset();
      onToken?.(state.token);
    }
  }, [state, onToken]);

  return (
    <div className="flex flex-col gap-3">
      <form ref={form} action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <div className="flex min-w-56 flex-1 flex-col gap-1">
          <label htmlFor="token-name" className="text-[13px] font-medium">
            {de.claude.nameLabel}
          </label>
          <input
            id="token-name"
            name="name"
            required
            maxLength={60}
            placeholder={de.claude.namePlaceholder}
            className="h-9 rounded-[var(--radius-badge)] border border-border bg-surface px-3 text-sm placeholder:text-muted"
          />
        </div>
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? de.claude.creating : de.claude.create}
        </Button>
      </form>
      {state.error ? (
        <p role="alert" className="text-xs text-prio-urgent-ink">
          {state.error}
        </p>
      ) : null}
      {state.token ? <NewToken token={state.token} /> : null}
    </div>
  );
}

function NewToken({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div role="status" className="flex flex-col gap-2 rounded-[var(--radius-badge)] border border-status-done-ink p-3">
      <p className="text-[13px]">{de.claude.createdOnce}</p>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="new-token" className="sr-only">
          {de.claude.tokenLabel}
        </label>
        <input
          id="new-token"
          readOnly
          value={token}
          onFocus={(e) => e.currentTarget.select()}
          className="h-9 min-w-0 flex-1 rounded-[var(--radius-badge)] border border-border bg-bg px-2 font-mono text-[13px]"
        />
        <Button
          type="button"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(token).then(() => setCopied(true));
          }}
        >
          {de.claude.copy}
        </Button>
      </div>
      <p aria-live="polite" className={cn("min-h-4 text-xs text-status-done-ink")}>
        {copied ? de.claude.copied : ""}
      </p>
    </div>
  );
}
