"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/client";
import { inviteAction, type ActionState } from "./actions";

export function InviteForm({ workspaceId, canInviteAdmins, disabled }: { workspaceId: string; canInviteAdmins: boolean; disabled: boolean }) {
  const t = useT();
  const [state, action, pending] = useActionState<ActionState, FormData>(inviteAction, {});
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) form.current?.reset();
    // Runs once per answer (state changes per submit), not on mount.
    if (state.invited) trackEvent("Team", "Member invited", "settings", state.invited);
  }, [state]);

  return (
    <form ref={form} action={action} className="flex flex-col gap-3">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <div className="flex flex-col gap-1">
        <label htmlFor="emails" className="text-[13px] font-medium">
          {t.members.inviteLabel}
        </label>
        <textarea
          id="emails"
          name="emails"
          rows={2}
          disabled={disabled}
          placeholder={t.onboarding.invitesPlaceholder}
          className="rounded-[var(--radius-badge)] border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted disabled:opacity-50"
        />
      </div>
      <div className="flex items-center gap-3">
        <label htmlFor="role" className="text-[13px] font-medium">
          {t.members.role}
        </label>
        <select id="role" name="role" disabled={disabled} className="h-8 rounded-[var(--radius-badge)] border border-border bg-surface px-2 text-sm">
          <option value="member">{t.roles.member}</option>
          {canInviteAdmins ? <option value="admin">{t.roles.admin}</option> : null}
        </select>
        <Button type="submit" variant="primary" size="sm" disabled={pending || disabled} className="ml-auto">
          {pending ? t.members.inviting : t.members.invite}
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
