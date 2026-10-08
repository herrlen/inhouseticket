"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createLabelAction } from "@/app/(app)/[workspace]/ticket-actions";
import type { ActivityRow, LabelRow, TicketRow } from "@/db/queries/tickets";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { relativeTime } from "@/lib/relative-time";
import { de } from "@/lib/i18n/de";
import { MAX_TITLE } from "@/lib/limits";
import { PALETTE } from "@/lib/palette";
import type { TicketPatch } from "@/lib/validation/ticket";
import { useProjectInfo } from "./context";
import { dueBucket, todayInBerlin } from "./list-model";
import { AssigneePicker, DueDateInput, PriorityPicker, StatusPicker } from "./pickers";
import { Attachments, Comments, DescriptionField, Subtasks } from "./detail-parts";
import { usePartActions, useParts } from "./use-parts";
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
  const parts = useParts(workspaceId, ticket.id);
  const actions = usePartActions(workspaceId, project.id, ticket.id);
  const [tab, setTab] = useState<"comments" | "activity">("comments");

  // Keyboard while the panel is open (not in fields or menus): ↑/↓ switch tickets,
  // 1–4 priority (Dringend … Niedrig), 0 none, A assign, D due date (KONZEPT §2.7).
  const panel = useRef<HTMLDivElement>(null);
  const latest = useRef({ onNavigate, onPatch });
  useEffect(() => {
    latest.current = { onNavigate, onPatch };
  });
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target instanceof HTMLElement ? e.target : null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.closest("[role=menu],[role=listbox]"))) return;
      const key = e.key.toLowerCase();
      if (key === "arrowdown" || key === "arrowup") {
        e.preventDefault();
        latest.current.onNavigate(key === "arrowdown" ? 1 : -1);
      } else if (["0", "1", "2", "3", "4"].includes(key)) {
        e.preventDefault();
        latest.current.onPatch({ priority: key === "0" ? 0 : 5 - Number(key) });
      } else if (key === "a") {
        e.preventDefault();
        panel.current?.querySelector<HTMLButtonElement>('button[aria-label^="Zuständig für"]')?.click();
      } else if (key === "d") {
        e.preventDefault();
        const input = panel.current?.querySelector<HTMLInputElement>('input[type="date"]');
        input?.focus();
        try {
          input?.showPicker();
        } catch {
          // showPicker needs a user gesture in some browsers – focus is enough then.
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div ref={panel} className="flex flex-col gap-6">
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

      <DescriptionField value={ticket.description ?? ""} onSave={(v) => onPatch({ description: v })} />

      {parts.data ? (
        <>
          <Subtasks subtasks={parts.data.subtasks} actions={actions} />
          <Attachments workspaceId={workspaceId} ticketId={ticket.id} attachments={parts.data.attachments} manageAll={parts.data.manageAttachments} actions={actions} />
        </>
      ) : parts.isError ? (
        <p className="text-xs text-prio-urgent-ink">{de.detail.activityError}</p>
      ) : (
        <div className="h-24 animate-pulse rounded-[var(--radius-badge)] bg-bg" aria-hidden />
      )}

      <section aria-label={de.detail.tabs}>
        <div role="tablist" aria-label={de.detail.tabs} className="mb-3 flex gap-4 border-b border-border text-[13px]">
          {(["comments", "activity"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              id={`tab-${t}`}
              aria-selected={tab === t}
              aria-controls={`panel-${t}`}
              tabIndex={tab === t ? 0 : -1}
              onClick={() => setTab(t)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                  e.preventDefault();
                  const next = t === "comments" ? "activity" : "comments";
                  setTab(next);
                  document.getElementById(`tab-${next}`)?.focus();
                }
              }}
              className={cn("-mb-px border-b-2 pb-2", tab === t ? "border-accent font-medium" : "border-transparent text-muted hover:text-text")}
            >
              {t === "comments" ? `${de.detail.comments}${parts.data?.comments.length ? ` (${parts.data.comments.length})` : ""}` : de.detail.activity}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === "comments" ? (
            parts.data ? <Comments comments={parts.data.comments} actions={actions} /> : null
          ) : (
            <Activity workspaceId={workspaceId} ticketId={ticket.id} />
          )}
        </div>
      </section>
      {/* Keyboard hints are pointless on touch screens. */}
      <p className="hidden text-xs text-muted [@media(hover:hover)]:block">{de.detail.navHint}</p>
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
    case "subtask_added": return de.activity.subtask_added(str(p.title));
    case "subtask_done": return de.activity.subtask_done(str(p.title));
    case "subtask_reopened": return de.activity.subtask_reopened(str(p.title));
    case "subtask_removed": return de.activity.subtask_removed(str(p.title));
    case "attachment_added": return de.activity.attachment_added(str(p.fileName));
    case "attachment_removed": return de.activity.attachment_removed(str(p.fileName));
    case "imported": return de.import.activity(str(p.source), p.ref ? String(p.ref) : "");
    default: return a.type;
  }
}

function Activity({ workspaceId, ticketId }: { workspaceId: string; ticketId: string }) {
  const { data, isError } = useActivity(workspaceId, ticketId);
  return (
    <section>
      {isError ? <p className="text-xs text-prio-urgent-ink">{de.detail.activityError}</p> : null}
      <ol className="flex flex-col gap-1.5 border-l border-border pl-3 text-xs">
        {(data ?? []).map((a) => (
          <li key={a.id}>
            <span className="font-medium">{a.actorName ?? de.activity.someone}</span> {describe(a)}
            {a.via === "mcp" ? <span className="text-muted"> {de.activity.viaClaude}</span> : null}
            <span className="text-muted"> · <time dateTime={a.createdAt}>{relativeTime(a.createdAt)}</time></span>
          </li>
        ))}
      </ol>
    </section>
  );
}
