"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import { connectAction, type TokenState } from "./actions";
import deIntegrations from "@/lib/i18n/de/integrations";

const MESSAGES = { integrations: deIntegrations };

/** Token entry: the value goes to the server action once and is never rendered back. */
export function TokenForm({ workspaceId }: { workspaceId: string }) {
  const t = useT(MESSAGES);
  const [state, action, pending] = useActionState<TokenState, FormData>(connectAction, {});
  const c = t.integrations.clickup;
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <div className="flex flex-col gap-1">
        <label htmlFor="clickup-token" className="text-[13px] font-medium">
          {c.tokenLabel}
        </label>
        <input
          id="clickup-token"
          name="token"
          type="password"
          autoComplete="off"
          spellCheck={false}
          required
          maxLength={200}
          placeholder="pk_…"
          aria-describedby="clickup-token-help clickup-token-error"
          aria-invalid={state.error ? true : undefined}
          className="h-9 rounded-[var(--radius-badge)] border border-border bg-surface px-3 font-mono text-sm placeholder:text-muted"
        />
        <p id="clickup-token-help" className="text-[13px] text-muted">
          {c.tokenHelp}
        </p>
      </div>
      <p id="clickup-token-error" role="alert" className="text-[13px] text-prio-urgent-ink empty:hidden">
        {state.error ?? ""}
      </p>
      <div>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? c.tokenChecking : c.tokenCheck}
        </Button>
      </div>
    </form>
  );
}
