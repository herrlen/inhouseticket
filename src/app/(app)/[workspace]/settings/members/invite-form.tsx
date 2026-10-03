"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { de } from "@/lib/i18n/de";
import { inviteAction, type ActionState } from "./actions";

export function InviteForm({ workspaceId, canInviteAdmins, disabled }: { workspaceId: string; canInviteAdmins: boolean; disabled: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(inviteAction, {});
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={action} className="flex flex-col gap-3">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <div className="flex flex-col gap-1">
        <label htmlFor="emails" className="text-[13px] font-medium">
          {de.members.inviteLabel}
        </label>
        <textarea
          id="emails"
          name="emails"
          rows={2}
          disabled={disabled}
          placeholder="anna@firma.de, max@firma.de"
          className="rounded-[var(--radius-badge)] border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted disabled:opacity-50"
        />
      </div>
      <div className="flex items-center gap-3">
        <label htmlFor="role" className="text-[13px] font-medium">
          {de.members.role}
        </label>
        <select id="role" name="role" disabled={disabled} className="h-8 rounded-[var(--radius-badge)] border border-border bg-surface px-2 text-sm">
          <option value="member">{de.roles.member}</option>
          {canInviteAdmins ? <option value="admin">{de.roles.admin}</option> : null}
        </select>
        <Button type="submit" variant="primary" size="sm" disabled={pending || disabled} className="ml-auto">
          {pending ? de.members.inviting : de.members.invite}
        </Button>
      </div>
      <p
        role={state.error ? "alert" : "status"}
        className={cn("min-h-4 text-xs", state.error ? "text-prio-urgent-ink" : "text-status-done-ink")}
      >
        {state.error ?? state.success ?? ""}
      </p>
    </form>
  );
}
