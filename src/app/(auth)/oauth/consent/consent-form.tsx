"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import { consentAction, type ConsentState } from "./actions";

export function ConsentForm({ oauthQuery, workspaces, email }: { oauthQuery: string; workspaces: Array<{ id: string; name: string }>; email: string }) {
  const t = useT();
  const [state, action, pending] = useActionState<ConsentState, FormData>(consentAction, {});

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="oauthQuery" value={oauthQuery} />
      {workspaces.length === 0 ? (
        <p role="alert" className="text-prio-urgent-ink">{t.oauth.noWorkspace}</p>
      ) : workspaces.length === 1 ? (
        <>
          <input type="hidden" name="workspaceId" value={workspaces[0]!.id} />
          <p className="font-medium">{t.oauth.oneWorkspace(workspaces[0]!.name)}</p>
        </>
      ) : (
        <div className="flex flex-col gap-1">
          <label htmlFor="oauth-workspace" className="text-[13px] font-medium">
            {t.oauth.workspaceLabel}
          </label>
          <select id="oauth-workspace" name="workspaceId" className="h-9 rounded-[var(--radius-badge)] border border-border bg-surface px-2 text-sm">
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <p className="text-[13px] text-muted">{email}</p>
      {state.error ? (
        <p role="alert" className="text-[13px] text-prio-urgent-ink">
          {state.error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" name="accept" value="yes" variant="primary" disabled={pending || workspaces.length === 0}>
          {t.oauth.allow}
        </Button>
        <Button type="submit" name="accept" value="no" disabled={pending}>
          {t.oauth.deny}
        </Button>
      </div>
      <p className="text-[13px] text-muted">{t.oauth.revokeHint}</p>
    </form>
  );
}
