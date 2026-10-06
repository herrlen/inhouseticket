"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { de } from "@/lib/i18n/de";
import { deleteWorkspaceAction, type DeleteState } from "./actions";

export function DeleteWorkspaceForm({ workspaceId, slug }: { workspaceId: string; slug: string }) {
  const [state, action, pending] = useActionState<DeleteState, FormData>(deleteWorkspaceAction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <div className="flex min-w-56 flex-1 flex-col gap-1">
        <label htmlFor="delete-confirm" className="text-[13px] font-medium">
          {de.data.deleteConfirm(slug)}
        </label>
        <input id="delete-confirm" name="confirm" required autoComplete="off" className="h-9 rounded-[var(--radius-badge)] border border-border bg-surface px-3 font-mono text-sm" />
      </div>
      <Button type="submit" variant="danger" size="sm" disabled={pending}>
        {de.data.deleteButton}
      </Button>
      {state.error ? (
        <p role="alert" className="w-full text-[13px] text-prio-urgent-ink">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
