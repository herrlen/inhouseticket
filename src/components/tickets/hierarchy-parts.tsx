"use client";

import { useState } from "react";
import type { TicketRow } from "@/db/queries/tickets";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Plus } from "@/components/ui/icons";
import { useT } from "@/lib/i18n/client";
import { MAX_TITLE } from "@/lib/limits";
import { allowedChildTypes, allowedParentTypes, childProgress, TICKET_TYPES, type TicketType } from "@/lib/ticket-hierarchy";
import type { TicketPatch } from "@/lib/validation/ticket";
import { useProjectInfo } from "./context";
import { StatusDot } from "./pickers";
import { TypeIcon } from "./type-icon";
import deHierarchy from "@/lib/i18n/de/hierarchy";

const MESSAGES = { hierarchy: deHierarchy };

const field = "h-8 max-w-full rounded-[var(--radius-badge)] border border-border bg-surface px-2 text-[13px]";

function keyOf(projectKey: string, t: TicketRow) {
  return t.id.startsWith("temp-") ? `${projectKey}-…` : `${projectKey}-${t.number}`;
}

/** "Typ" and "Übergeordnet" rows for the detail's field list (dt/dd pairs). */
export function HierarchyFields({ ticket, tickets, onPatch, onOpen }: { ticket: TicketRow; tickets: TicketRow[]; onPatch: (patch: TicketPatch) => void; onOpen: (ticketId: string) => void }) {
  const t = useT(MESSAGES);
  const { project } = useProjectInfo();
  const allowed = allowedParentTypes(ticket.type);
  const parent = ticket.parentId ? (tickets.find((x) => x.id === ticket.parentId) ?? null) : null;
  const candidates = tickets.filter((x) => x.id !== ticket.id && !x.id.startsWith("temp-") && (allowed.includes(x.type) || x.id === ticket.parentId));
  return (
    <>
      <dt className="text-muted"><label htmlFor="ticket-type">{t.hierarchy.type}</label></dt>
      <dd className="py-1">
        <span className="inline-flex items-center gap-2">
          <TypeIcon type={ticket.type} />
          <select
            id="ticket-type"
            value={ticket.type}
            onChange={(e) => {
              const type = TICKET_TYPES.find((x) => x === e.target.value);
              if (type && type !== ticket.type) onPatch({ type });
            }}
            className={field}
          >
            {TICKET_TYPES.map((type) => <option key={type} value={type}>{t.hierarchy.types[type]}</option>)}
          </select>
        </span>
      </dd>
      {allowed.length > 0 || parent ? (
        <>
          <dt className="text-muted"><label htmlFor="ticket-parent">{t.hierarchy.parent}</label></dt>
          <dd className="flex flex-wrap items-center gap-2 py-1">
            <select
              id="ticket-parent"
              value={ticket.parentId ?? ""}
              onChange={(e) => onPatch({ parentId: e.target.value || null })}
              className={field}
            >
              {/* A subtask always needs a parent: no "none" option once it has one. */}
              {ticket.type !== "subtask" || !ticket.parentId ? <option value="">{t.hierarchy.noParent}</option> : null}
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>{`${keyOf(project.key, c)} · ${t.hierarchy.types[c.type]} · ${c.title}`}</option>
              ))}
            </select>
            {parent ? (
              <button
                type="button"
                onClick={() => onOpen(parent.id)}
                aria-label={t.hierarchy.openParent(keyOf(project.key, parent), parent.title)}
                className="inline-flex min-w-0 items-center gap-1 rounded px-1 text-accent underline underline-offset-2 hover:bg-bg"
              >
                <TypeIcon type={parent.type} />
                <span className="font-mono text-xs">{keyOf(project.key, parent)}</span>
              </button>
            ) : null}
          </dd>
        </>
      ) : null}
    </>
  );
}

/**
 * Child tickets: "Tickets in diesem Epic" (stories/tasks) or "Unteraufgaben" (subtasks) with
 * status, person, progress and inline creation.
 */
export function ChildTickets({
  ticket,
  tickets,
  onOpen,
  onCreate,
}: {
  ticket: TicketRow;
  tickets: TicketRow[];
  onOpen: (ticketId: string) => void;
  onCreate: (input: { title: string; type: TicketType }) => void;
}) {
  const t = useT(MESSAGES);
  const { project, statuses, members } = useProjectInfo();
  const childTypes = allowedChildTypes(ticket.type);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<TicketType>(childTypes[0] ?? "task");
  const children = tickets.filter((x) => x.parentId === ticket.id);
  if (childTypes.length === 0 && children.length === 0) return null;

  const isEpic = ticket.type === "epic";
  const doneIds = new Set(statuses.filter((s) => s.category === "done").map((s) => s.id));
  const progress = childProgress(children, doneIds);
  const addLabel = isEpic ? t.hierarchy.addToEpic : t.hierarchy.addSubtask;
  const newType = childTypes.includes(type) ? type : (childTypes[0] ?? "task");

  return (
    <section aria-labelledby="children-heading" className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <h3 id="children-heading" className="text-[13px] font-medium">{isEpic ? t.hierarchy.epicChildren : t.hierarchy.subtaskChildren}</h3>
        {children.length > 0 ? <span className="text-xs text-muted tabular-nums">{t.hierarchy.progress(progress.done, progress.total)}</span> : null}
      </div>
      {children.length > 0 ? (
        <ul className="flex flex-col">
          {children.map((c) => {
            const status = statuses.find((s) => s.id === c.statusId);
            const assignee = members.find((m) => m.id === c.assigneeId);
            const pending = c.id.startsWith("temp-");
            const key = keyOf(project.key, c);
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-[var(--radius-badge)] px-1 py-1 text-[13px] hover:bg-bg">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onOpen(c.id)}
                  aria-label={t.hierarchy.openChild(key, c.title)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left hover:underline"
                >
                  <TypeIcon type={c.type} />
                  <span className="font-mono text-xs text-muted">{key}</span>
                  <span className={doneIds.has(c.statusId) ? "truncate text-muted line-through" : "truncate"}>{c.title}</span>
                </button>
                {status ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted">
                    <StatusDot color={status.color} />
                    {status.name}
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1 text-xs text-muted">
                  {assignee ? <Avatar user={assignee} size="sm" /> : null}
                  {assignee ? assignee.name : t.hierarchy.unassigned}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted">{t.hierarchy.noChildren}</p>
      )}
      {childTypes.length > 0 ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const value = title.trim();
            if (!value) return;
            onCreate({ title: value, type: newType });
            setTitle("");
          }}
        >
          {childTypes.length > 1 ? (
            <>
              <label htmlFor="new-child-type" className="sr-only">{t.hierarchy.newChildType}</label>
              <select id="new-child-type" value={newType} onChange={(e) => setType(childTypes.find((x) => x === e.target.value) ?? newType)} className={field}>
                {childTypes.map((x) => <option key={x} value={x}>{t.hierarchy.types[x]}</option>)}
              </select>
            </>
          ) : null}
          <label htmlFor="new-child" className="sr-only">{addLabel}</label>
          <input
            id="new-child"
            value={title}
            maxLength={MAX_TITLE}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t.hierarchy.newChildPlaceholder}
            className="h-8 min-w-40 flex-1 rounded-[var(--radius-badge)] border border-border bg-surface px-2 text-[13px] placeholder:text-muted"
          />
          <Button type="submit" size="sm" disabled={!title.trim()} aria-label={addLabel} title={addLabel}>
            <Plus size={14} />
          </Button>
        </form>
      ) : null}
    </section>
  );
}
