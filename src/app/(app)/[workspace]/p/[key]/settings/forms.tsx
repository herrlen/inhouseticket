"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  createStatusAction,
  deleteStatusAction,
  moveStatusAction,
  updateProjectAction,
  updateStatusAction,
  type FormState,
} from "@/app/(app)/[workspace]/actions";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import { ChevronDown, ChevronRight } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { de } from "@/lib/i18n/de";
import { PALETTE } from "@/lib/palette";
import { DEFAULT_STATUSES } from "@/lib/project-templates";

// Status colors: the four defaults plus the project palette.
const STATUS_COLORS = [...new Set([...DEFAULT_STATUSES.map((s) => s.color as string), ...Object.values(PALETTE)])];

function Feedback({ state }: { state: FormState }) {
  const message = state.error ?? (state.ok ? de.common.saved : "");
  return (
    <p role={state.error ? "alert" : "status"} className={cn("min-h-4 text-xs", state.error ? "text-prio-urgent-ink" : "text-status-done-ink")}>
      {message}
    </p>
  );
}

export function ProjectForm({ workspaceId, project }: { workspaceId: string; project: { id: string; name: string; key: string; color: string; icon: string | null } }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateProjectAction, {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="projectId" value={project.id} />
      <Input name="name" label={de.projectForm.name} defaultValue={project.name} maxLength={100} required error={e.name} />
      <Input label={de.projectForm.key} value={project.key} readOnly hint={de.projectSettings.keyFixed} inputClassName="font-mono" />
      <ColorPicker name="color" legend={de.projectForm.color} defaultValue={project.color} error={e.color} />
      <Input name="icon" label={de.projectForm.icon} defaultValue={project.icon ?? ""} maxLength={16} hint={de.projectForm.iconHint} error={e.icon} />
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending}>{de.common.save}</Button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

type StatusRef = { workspaceId: string; projectKey: string };
type StatusData = { id: string; name: string; color: string; category: "open" | "active" | "done"; ticketCount: number };

function Hidden({ workspaceId, projectKey, statusId }: StatusRef & { statusId?: string }) {
  return (
    <>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="projectKey" value={projectKey} />
      {statusId ? <input type="hidden" name="statusId" value={statusId} /> : null}
    </>
  );
}

function StatusFields({ status, idPrefix }: { status?: StatusData; idPrefix: string }) {
  return (
    <>
      <div className="flex min-w-40 flex-1 flex-col gap-1">
        <label htmlFor={`${idPrefix}-name`} className="sr-only">{de.projectSettings.statusName}</label>
        <input id={`${idPrefix}-name`} name="name" defaultValue={status?.name} maxLength={50} required placeholder={de.projectSettings.statusName}
          className="h-8 rounded-[var(--radius-badge)] border border-border bg-surface px-2 text-sm" />
      </div>
      <label htmlFor={`${idPrefix}-color`} className="sr-only">{de.projectSettings.statusColor}</label>
      <select id={`${idPrefix}-color`} name="color" defaultValue={status?.color ?? "#3B82F6"} className="h-8 rounded-[var(--radius-badge)] border border-border bg-surface px-2 text-sm">
        {STATUS_COLORS.map((c) => (
          <option key={c} value={c}>{de.projectSettings.colorName(c)}</option>
        ))}
      </select>
      <label htmlFor={`${idPrefix}-category`} className="sr-only">{de.projectSettings.category}</label>
      <select id={`${idPrefix}-category`} name="category" defaultValue={status?.category ?? "active"} className="h-8 rounded-[var(--radius-badge)] border border-border bg-surface px-2 text-sm">
        <option value="open">{de.projectSettings.categories.open}</option>
        <option value="active">{de.projectSettings.categories.active}</option>
        <option value="done">{de.projectSettings.categories.done}</option>
      </select>
    </>
  );
}

export function StatusRow({ status, isFirst, isLast, others, ...ref }: StatusRef & { status: StatusData; isFirst: boolean; isLast: boolean; others: Array<{ id: string; name: string }> }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateStatusAction, {});
  const [delState, delAction, deleting] = useActionState<FormState, FormData>(deleteStatusAction, {});
  const idPrefix = `status-${status.id}`;

  return (
    <li className="rounded-[var(--radius-badge)] border border-border p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: status.color }} />
        <form action={action} className="flex flex-1 flex-wrap items-center gap-2">
          <Hidden {...ref} statusId={status.id} />
          <StatusFields status={status} idPrefix={idPrefix} />
          <Button type="submit" size="sm" disabled={pending}>{de.common.save}</Button>
        </form>
        <form action={moveStatusAction} className="flex">
          <Hidden {...ref} statusId={status.id} />
          <button type="submit" name="direction" value="up" disabled={isFirst} aria-label={de.projectSettings.moveUp(status.name)}
            className="flex size-8 items-center justify-center rounded text-muted hover:bg-bg disabled:opacity-30">
            <ChevronRight className="-rotate-90" />
          </button>
          <button type="submit" name="direction" value="down" disabled={isLast} aria-label={de.projectSettings.moveDown(status.name)}
            className="flex size-8 items-center justify-center rounded text-muted hover:bg-bg disabled:opacity-30">
            <ChevronDown />
          </button>
        </form>
      </div>
      <form action={delAction} className="mt-2 flex flex-wrap items-center gap-2 pl-4 text-xs text-muted">
        <Hidden {...ref} statusId={status.id} />
        <span>{de.projectSettings.ticketCount(status.ticketCount)}</span>
        {status.ticketCount > 0 ? (
          <>
            <label htmlFor={`${idPrefix}-target`}>{de.projectSettings.moveTicketsTo}</label>
            <select id={`${idPrefix}-target`} name="targetStatusId" className="h-7 rounded-[var(--radius-badge)] border border-border bg-surface px-1">
              {others.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </>
        ) : null}
        <Button type="submit" variant="ghost" size="sm" disabled={deleting} aria-label={de.projectSettings.deleteStatus(status.name)}>
          {de.common.delete}
        </Button>
      </form>
      <div className="pl-4">
        <Feedback state={delState.error ? delState : state} />
      </div>
    </li>
  );
}

export function NewStatusForm(ref: StatusRef) {
  const [state, action, pending] = useActionState<FormState, FormData>(createStatusAction, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={action} className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
      <Hidden {...ref} />
      <StatusFields idPrefix="new-status" />
      <Button type="submit" size="sm" variant="primary" disabled={pending}>{de.projectSettings.addStatus}</Button>
      <div className="w-full">
        <Feedback state={state.fieldErrors?.name ? { error: state.fieldErrors.name } : state} />
      </div>
    </form>
  );
}
