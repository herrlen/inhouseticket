"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createLabelAction } from "@/app/(app)/[workspace]/ticket-actions";
import type { ActivityRow, LabelRow, TicketRow } from "@/db/queries/tickets";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { de } from "@/lib/i18n/de";
import { MAX_DESCRIPTION, MAX_TITLE } from "@/lib/limits";
import { PALETTE } from "@/lib/palette";
import type { TicketPatch } from "@/lib/validation/ticket";
import { useProjectInfo } from "./context";
import { dueBucket, todayInBerlin } from "./list-model";
import { AssigneePicker, DueDateInput, PriorityPicker, StatusPicker } from "./pickers";
import { useActivity } from "./use-tickets";

type Props = {
  ticket: TicketRow;
  onPatch: (patch: TicketPatch) => void;
  onNavigate: (direction: 1 | -1) => void;
  onLabelCreated: (label: LabelRow) => void;
};

function Counter({ value, max }: { value: number; max: number }) {
  return <span className={cn("text-xs tabular-nums", value > max * 0.9 ? "text-prio-high-ink" : "text-muted")}>{value}/{max}</span>;
}

/** Text field that saves on blur / Enter and when the panel closes (no explicit save button). */
function useDraft(initial: string, save: (value: string) => void) {
  const [draft, setDraft] = useState(initial);
  const latest = useRef({ draft, initial, save });
  useEffect(() => {
    latest.current = { draft, initial, save };
  });
  // Flush unsaved edits when switching tickets or closing the panel.
  useEffect(
    () => () => {
      const { draft: d, initial: i, save: s } = latest.current;
      if (d !== i) s(d);
    },
    [],
  );
  const commit = () => {
    if (draft !== initial) save(draft);
  };
  return { draft, setDraft, commit };
}

export function TicketDetail({ ticket, onPatch, onNavigate, onLabelCreated }: Props) {
  const { project, workspaceId, statuses } = useProjectInfo();
  const key = `${project.key}-${ticket.number}`;
  const today = todayInBerlin();
  const done = statuses.find((s) => s.id === ticket.statusId)?.category === "done";

  const title = useDraft(ticket.title, (v) => {
    const t = v.trim();
    if (t && t.length <= MAX_TITLE) onPatch({ title: t });
  });
  const description = useDraft(ticket.description ?? "", (v) => onPatch({ description: v }));

  // ↑/↓ switch tickets while the panel is open – wherever focus is, except in fields and menus.
  const navigateRef = useRef(onNavigate);
  useEffect(() => {
    navigateRef.current = onNavigate;
  });
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const el = e.target as HTMLElement | null;
      if (el && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.closest("[role=menu]"))) return;
      e.preventDefault();
      navigateRef.current(e.key === "ArrowDown" ? 1 : -1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs text-muted">{key}</span>
        <label htmlFor="ticket-title" className="sr-only">{de.detail.title}</label>
        <textarea
          id="ticket-title"
          value={title.draft}
          maxLength={MAX_TITLE}
          rows={2}
          onChange={(e) => title.setDraft(e.target.value.replace(/\n/g, " "))}
          onBlur={title.commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              title.commit();
              e.currentTarget.blur();
            }
          }}
          className="field-sizing-content min-h-9 resize-none rounded-[var(--radius-badge)] border border-transparent bg-transparent px-1 py-1 text-lg font-semibold hover:border-border focus:border-accent"
        />
        <div className="flex justify-end">
          <Counter value={title.draft.length} max={MAX_TITLE} />
        </div>
      </div>

      <dl className="grid grid-cols-[7rem_1fr] items-center gap-x-3 gap-y-1 text-[13px]">
        <dt className="text-muted">{de.project.colStatus}</dt>
        <dd><StatusPicker value={ticket.statusId} ticketLabel={key} onChange={(statusId) => onPatch({ statusId })} /></dd>
        <dt className="text-muted">{de.project.colPriority}</dt>
        <dd><PriorityPicker value={ticket.priority} ticketLabel={key} onChange={(priority) => onPatch({ priority })} /></dd>
        <dt className="text-muted">{de.list.colAssignee}</dt>
        <dd><AssigneePicker value={ticket.assigneeId} ticketLabel={key} onChange={(assigneeId) => onPatch({ assigneeId })} /></dd>
        <dt className="text-muted">{de.list.colDue}</dt>
        <dd>
          <DueDateInput value={ticket.dueDate} ticketLabel={key} overdue={dueBucket(ticket.dueDate, today, done) === "overdue"} onChange={(dueDate) => onPatch({ dueDate })} />
        </dd>
        <dt className="text-muted">{de.detail.labels}</dt>
        <dd>
          <LabelEditor
            workspaceId={workspaceId}
            ticket={ticket}
            onChange={(labelIds) => onPatch({ labelIds })}
            onCreated={onLabelCreated}
          />
        </dd>
      </dl>

      <div className="flex flex-col gap-1">
        <label htmlFor="ticket-description" className="text-[13px] font-medium">{de.detail.description}</label>
        <textarea
          id="ticket-description"
          value={description.draft}
          maxLength={MAX_DESCRIPTION}
          onChange={(e) => description.setDraft(e.target.value)}
          onBlur={description.commit}
          placeholder={de.detail.descriptionPlaceholder}
          className="field-sizing-content min-h-28 resize-y rounded-[var(--radius-badge)] border border-border bg-surface p-2 text-sm placeholder:text-muted"
        />
        <div className="flex justify-end">
          <Counter value={description.draft.length} max={MAX_DESCRIPTION} />
        </div>
      </div>

      <Activity workspaceId={workspaceId} ticketId={ticket.id} />
      <p className="text-xs text-muted">{de.detail.navHint}</p>
    </div>
  );
}

const LABEL_COLORS = Object.values(PALETTE);

function LabelEditor({ workspaceId, ticket, onChange, onCreated }: { workspaceId: string; ticket: TicketRow; onChange: (ids: string[]) => void; onCreated: (l: LabelRow) => void }) {
  const { project, labels } = useProjectInfo();
  const toast = useToast();
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();
  const current = labels.filter((l) => ticket.labelIds.includes(l.id));
  const listId = `labels-${ticket.id}`;

  function add(name: string) {
    const n = name.trim();
    if (!n) return;
    const existing = labels.find((l) => l.name.toLowerCase() === n.toLowerCase());
    if (existing) {
      if (!ticket.labelIds.includes(existing.id)) onChange([...ticket.labelIds, existing.id]);
      setValue("");
      return;
    }
    startTransition(async () => {
      const r = await createLabelAction({ workspaceId, projectId: project.id, name: n, color: LABEL_COLORS[labels.length % LABEL_COLORS.length]! });
      if (!r.ok) return toast({ message: r.error, tone: "error" });
      onCreated(r.data);
      onChange([...ticket.labelIds, r.data.id]);
      setValue("");
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 py-1">
      {current.map((l) => (
        <span key={l.id} className="inline-flex items-center gap-1 rounded-full border border-border py-0.5 pr-1 pl-2 text-xs">
          <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: l.color }} />
          {l.name}
          <button
            type="button"
            onClick={() => onChange(ticket.labelIds.filter((id) => id !== l.id))}
            aria-label={de.detail.removeLabel(l.name)}
            className="rounded-full px-1 text-muted hover:bg-bg hover:text-text"
          >
            ×
          </button>
        </span>
      ))}
      <input
        list={listId}
        value={value}
        disabled={pending}
        maxLength={50}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(value);
          }
        }}
        aria-label={de.detail.addLabel}
        placeholder={de.detail.addLabelPlaceholder}
        className="h-7 w-36 rounded-[var(--radius-badge)] bg-transparent px-1.5 text-xs placeholder:text-muted hover:bg-bg"
      />
      <datalist id={listId}>
        {labels.filter((l) => !ticket.labelIds.includes(l.id)).map((l) => (
          <option key={l.id} value={l.name} />
        ))}
      </datalist>
    </div>
  );
}

const rtf = new Intl.RelativeTimeFormat("de-DE", { numeric: "auto" });

function relative(iso: string): string {
  const s = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const abs = Math.abs(s);
  if (abs < 60) return rtf.format(Math.round(s), "second");
  if (abs < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(s / 3600), "hour");
  return rtf.format(Math.round(s / 86400), "day");
}

function describe(a: ActivityRow): string {
  const p = a.payload as Record<string, unknown>;
  const str = (v: unknown) => (v === null || v === undefined || v === "" ? "–" : String(v));
  switch (a.type) {
    case "created": return de.activity.created;
    case "title": return de.activity.title(str(p.to));
    case "description": return de.activity.description;
    case "status": return de.activity.status(str(p.from), str(p.to));
    case "priority": return de.activity.priority(de.priority[(["none", "low", "medium", "high", "urgent"] as const)[Number(p.to)] ?? "none"]);
    case "assignee": return p.to ? de.activity.assignee(str(p.to)) : de.activity.unassigned;
    case "due": return p.to ? de.activity.due(new Intl.DateTimeFormat("de-DE", { timeZone: "UTC" }).format(new Date(`${String(p.to)}T00:00:00Z`))) : de.activity.dueRemoved;
    case "labels": return de.activity.labels((p.added as string[]) ?? [], (p.removed as string[]) ?? []);
    default: return a.type;
  }
}

function Activity({ workspaceId, ticketId }: { workspaceId: string; ticketId: string }) {
  const { data, isError } = useActivity(workspaceId, ticketId);
  return (
    <section aria-labelledby="activity-heading">
      <h3 id="activity-heading" className="mb-2 text-[13px] font-medium">{de.detail.activity}</h3>
      {isError ? <p className="text-xs text-prio-urgent-ink">{de.detail.activityError}</p> : null}
      <ol className="flex flex-col gap-1.5 border-l border-border pl-3 text-xs">
        {(data ?? []).map((a) => (
          <li key={a.id}>
            <span className="font-medium">{a.actorName ?? de.activity.someone}</span> {describe(a)}
            {a.via === "mcp" ? <span className="text-muted"> {de.activity.viaClaude}</span> : null}
            <span className="text-muted"> · <time dateTime={a.createdAt}>{relative(a.createdAt)}</time></span>
          </li>
        ))}
      </ol>
    </section>
  );
}
