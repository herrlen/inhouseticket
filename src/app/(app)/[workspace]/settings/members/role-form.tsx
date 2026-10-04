"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { de } from "@/lib/i18n/de";
import { changeRoleAction, type ActionState } from "./actions";

export function RoleForm({ workspaceId, membershipId, name, role }: { workspaceId: string; membershipId: string; name: string; role: "admin" | "member" }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(changeRoleAction, {});
  const id = `role-${membershipId}`;
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="membershipId" value={membershipId} />
      <label className="sr-only" htmlFor={id}>
        {de.members.roleOf(name)}
      </label>
      <select id={id} name="role" defaultValue={role} className="h-8 rounded-[var(--radius-badge)] border border-border bg-surface px-2 text-sm">
        <option value="member">{de.roles.member}</option>
        <option value="admin">{de.roles.admin}</option>
      </select>
      <Button type="submit" size="sm" disabled={pending}>
        {de.members.save}
      </Button>
      <span role={state.error ? "alert" : "status"} className={cn("text-xs", state.error ? "text-prio-urgent-ink" : "text-status-done-ink")}>
        {state.error ?? state.success ?? ""}
      </span>
    </form>
  );
}
