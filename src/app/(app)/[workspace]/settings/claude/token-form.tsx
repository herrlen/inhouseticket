"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { de } from "@/lib/i18n/de";
import { DEFAULT_EXPIRY, EXPIRY_CHOICES, type ExpiryChoice } from "@/lib/token-expiry";
import { createTokenAction, type TokenState } from "./actions";

export function TokenForm({ workspaceId, onToken }: { workspaceId: string; onToken?: (token: string) => void }) {
  // Controlled fields: React resets uncontrolled ones after every submit, which would drop the input on errors.
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState<ExpiryChoice>(DEFAULT_EXPIRY);
  const [expiryDate, setExpiryDate] = useState("");
  const [state, action, pending] = useActionState<TokenState, FormData>(async (prev, formData) => {
    const result = await createTokenAction(prev, formData);
    if (result.token) {
      setName(""); // expiry stays selected for the next token
      onToken?.(result.token);
    }
    return result;
  }, {});

  return (
    <div className="flex flex-col gap-3">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <div className="flex min-w-56 flex-1 flex-col gap-1">
          <label htmlFor="token-name" className="text-[13px] font-medium">
            {de.claude.nameLabel}
          </label>
          <input
            id="token-name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={60}
            placeholder={de.claude.namePlaceholder}
            className="h-9 rounded-[var(--radius-badge)] border border-border bg-surface px-3 text-sm placeholder:text-muted"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="token-expiry" className="text-[13px] font-medium">
            {de.claude.expiryLabel}
          </label>
          <select
            id="token-expiry"
            name="expiry"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value as ExpiryChoice)}
            className="h-9 rounded-[var(--radius-badge)] border border-border bg-surface px-2 text-sm"
          >
            {EXPIRY_CHOICES.map((c) => (
              <option key={c} value={c}>
                {de.claude.expiryOptions[c]}
              </option>
            ))}
          </select>
        </div>
        {expiry === "custom" ? (
          <div className="flex flex-col gap-1">
            <label htmlFor="token-expiry-date" className="text-[13px] font-medium">
              {de.claude.expiryDateLabel}
            </label>
            <input id="token-expiry-date" name="expiryDate" type="date" required value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className="h-9 rounded-[var(--radius-badge)] border border-border bg-surface px-2 text-sm" />
          </div>
        ) : null}
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
