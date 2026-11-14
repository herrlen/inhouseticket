"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createLabelAction } from "@/app/(app)/[workspace]/ticket-actions";
import type { TicketSource } from "@/db/queries/integrations";
import type { ActivityRow, LabelRow, TicketRow } from "@/db/queries/tickets";
import { Calendar, OpenOut } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { relativeTime } from "@/lib/relative-time";
import { useLocale, useT } from "@/lib/i18n/client";
import type { Messages } from "@/lib/i18n/de";
import { intlLocale, type Locale } from "@/lib/i18n/locale";
import { PROVIDER_NAMES } from "@/lib/integrations/providers";
import { MAX_TITLE } from "@/lib/limits";
import { PALETTE } from "@/lib/palette";
import type { TicketPatch } from "@/lib/validation/ticket";
import { useProjectInfo } from "./context";
import { dueBucket, todayInBerlin } from "./list-model";
import { AssigneePicker, PriorityPicker, StatusPicker } from "./pickers";
import { relativeDue } from "./ticket-ui";
import { TypeIcon } from "./type-icon";
import { Attachments, Comments, DescriptionField, Subtasks } from "./detail-parts";
import { ChildTickets, HierarchyFields } from "./hierarchy-parts";
import { usePartActions, useParts } from "./use-parts";
import { useActivity } from "./use-tickets";
import deActivity from "@/lib/i18n/de/activity";
import deDetail from "@/lib/i18n/de/detail";
import deList from "@/lib/i18n/de/list";
import dePriority from "@/lib/i18n/de/priority";
import deProject from "@/lib/i18n/de/project";
import deTicket from "@/lib/i18n/de/ticket";
import deHierarchy from "@/lib/i18n/de/hierarchy";
import { isTicketType, type TicketType } from "@/lib/ticket-hierarchy";

const MESSAGES = { activity: deActivity, detail: deDetail, hierarchy: deHierarchy, list: deList, priority: dePriority, project: deProject, ticket: deTicket };

type Props = {
  ticket: TicketRow;
  /** All tickets of the project: parent candidates and child tickets come from here. */
  tickets: TicketRow[];
  onOpen: (ticketId: string) => void;
  onCreateChild: (input: { title: string; type: TicketType }) => void;
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

export function TicketDetail({ ticket, tickets, onOpen, onCreateChild, onPatch, onNavigate, onLabelCreated }: Props) {
  const t = useT(MESSAGES);
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
  const [tab, setTab] = useState<"comments" | "activity" | "files">("comments");
  const locale = useLocale();
  const overdue = dueBucket(ticket.dueDate, today, done) === "overdue";
  const dueUrgent = Boolean(ticket.dueDate) && (overdue || (ticket.dueDate === today && !done));

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
        panel.current?.querySelector<HTMLButtonElement>("[data-assignee-picker] button[aria-haspopup]")?.click();
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

  const TABS = ["comments", "activity", "files"] as const;
  const tabLabel = (k: (typeof TABS)[number]) =>
    k === "comments"
      ? `${t.detail.comments}${parts.data?.comments.length ? ` · ${parts.data.comments.length}` : ""}`
      : k === "activity"
        ? t.detail.activity
        : `${t.detail.files} · ${parts.data?.attachments.length ?? ticket.attachmentCount}`;

  // Layout as in emuchat (Redesign X2): key and type, the title, the properties as a compact
  // list (label | value chip), description, hierarchy, checklist, then the tabs.
  return (
    <div ref={panel} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-mono text-sm text-muted">{key}</span>
          <TypeIcon type={ticket.type} withLabel className="text-xs" />
        </div>
        {parts.data?.source ? <TicketSourceLine source={parts.data.source} /> : null}
        <label htmlFor="ticket-title" className="sr-only">{t.detail.title}</label>
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
          className="-mx-1 field-sizing-content min-h-9 resize-none rounded-[var(--radius-field)] border border-transparent bg-transparent px-1 py-1 text-xl leading-snug font-bold hover:border-border focus:border-accent"
        />
        <div className="flex justify-end">
          <Counter value={title.draft.length} max={MAX_TITLE} />
        </div>
      </div>

      <dl className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted">{t.project.colStatus}</dt>
        <dd className="min-w-0"><StatusPicker value={ticket.statusId} ticketLabel={key} onChange={(statusId) => onPatch({ statusId })} /></dd>
        <HierarchyFields ticket={ticket} tickets={tickets} onPatch={onPatch} onOpen={onOpen} />
        <dt className="text-muted">{t.list.colAssignee}</dt>
        <dd className="min-w-0"><AssigneePicker value={ticket.assigneeId} ticketLabel={key} onChange={(assigneeId) => onPatch({ assigneeId })} /></dd>
        <dt className="text-muted">{t.project.colPriority}</dt>
        <dd className="min-w-0"><PriorityPicker value={ticket.priority} ticketLabel={key} onChange={(priority) => onPatch({ priority })} /></dd>
        <dt className="text-muted">{t.list.colDue}</dt>
        <dd className="flex min-w-0 items-center gap-1">
          <Calendar size={14} className={cn("ml-1.5 shrink-0", dueUrgent ? "text-prio-urgent-ink" : "text-muted")} />
          <input
            type="date"
            value={ticket.dueDate ?? ""}
            aria-label={t.ticket.dueOf(key)}
            onChange={(e) => {
              const next = e.target.value || null;
              if (next !== ticket.dueDate) onPatch({ dueDate: next });
            }}
            className={cn("h-7 rounded-[var(--radius-badge)] bg-transparent px-1 text-sm hover:bg-hover", !ticket.dueDate && "text-muted", dueUrgent && "font-medium text-prio-urgent-ink")}
          />
          {ticket.dueDate ? (
            <span className={cn("text-xs", dueUrgent ? "text-prio-urgent-ink" : "text-muted")}>
              {overdue ? <span className="sr-only">{t.list.due.overdue}: </span> : null}
              {relativeDue(ticket.dueDate, today, locale, t.list.dueRelative)}
            </span>
          ) : null}
        </dd>
        <dt className="self-start pt-2 text-muted">{t.detail.labels}</dt>
        <dd className="min-w-0">
          <LabelEditor
            workspaceId={workspaceId}
            ticket={ticket}
            onChange={(labelIds) => onPatch({ labelIds })}
            onCreated={onLabelCreated}
          />
        </dd>
      </dl>

      <DescriptionField value={ticket.description ?? ""} onSave={(v) => onPatch({ description: v })} />

      <ChildTickets ticket={ticket} tickets={tickets} onOpen={onOpen} onCreate={onCreateChild} />

      {parts.data ? (
        <Subtasks subtasks={parts.data.subtasks} actions={actions} canConvert={ticket.type === "story" || ticket.type === "task"} />
      ) : parts.isError ? (
        <p className="text-xs text-prio-urgent-ink">{t.detail.activityError}</p>
      ) : (
        <div className="h-24 animate-pulse rounded-[var(--radius-badge)] bg-hover" aria-hidden />
      )}

      <section aria-label={t.detail.tabs}>
        <div role="tablist" aria-label={t.detail.tabs} className="mb-3 flex gap-4 border-b border-border text-sm">
          {TABS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              id={`tab-${k}`}
              aria-selected={tab === k}
              aria-controls={`panel-${k}`}
              tabIndex={tab === k ? 0 : -1}
              onClick={() => setTab(k)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                  e.preventDefault();
                  const next = TABS[(TABS.indexOf(k) + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length]!;
                  setTab(next);
                  document.getElementById(`tab-${next}`)?.focus();
                }
              }}
              className={cn("-mb-px border-b-2 px-1 pb-2", tab === k ? "border-accent font-semibold text-accent-strong" : "border-transparent text-secondary hover:text-text")}
            >
              {tabLabel(k)}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === "comments" ? (
            parts.data ? <Comments comments={parts.data.comments} actions={actions} /> : null
          ) : tab === "activity" ? (
            <Activity workspaceId={workspaceId} ticketId={ticket.id} />
          ) : parts.data ? (
            <Attachments workspaceId={workspaceId} ticketId={ticket.id} attachments={parts.data.attachments} manageAll={parts.data.manageAttachments} actions={actions} />
          ) : null}
        </div>
      </section>
      {/* Keyboard hints are pointless on touch screens. */}
      <p className="hidden text-xs text-muted [@media(hover:hover)]:block">{t.detail.navHint}</p>
    </div>
  );
}

const LABEL_COLORS = Object.values(PALETTE);

/** "Quelle: ClickUp" with a link to the task in the other tool (opens in a new tab). */
function TicketSourceLine({ source }: { source: TicketSource }) {
  const t = useT(MESSAGES);
  const name = PROVIDER_NAMES[source.provider];
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
      <span>{t.detail.source(name)}</span>
      {source.url ? (
        <a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          {t.detail.sourceOpen(name)}
          <OpenOut aria-hidden className="size-3" />
        </a>
      ) : null}
    </p>
  );
}

function LabelEditor({ workspaceId, ticket, onChange, onCreated }: { workspaceId: string; ticket: TicketRow; onChange: (ids: string[]) => void; onCreated: (l: LabelRow) => void }) {
  const t = useT(MESSAGES);
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
            aria-label={t.detail.removeLabel(l.name)}
            className="rounded-full px-1 text-muted hover:bg-hover hover:text-text"
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
        aria-label={t.detail.addLabel}
        placeholder={t.detail.addLabelPlaceholder}
        className="h-7 w-36 rounded-[var(--radius-badge)] bg-transparent px-1.5 text-xs placeholder:text-muted hover:bg-hover"
      />
      <datalist id={listId}>
        {labels.filter((l) => !ticket.labelIds.includes(l.id)).map((l) => (
          <option key={l.id} value={l.name} />
        ))}
      </datalist>
    </div>
  );
}

function describe(a: ActivityRow, t: Pick<Messages, "activity" | "priority" | "hierarchy">, locale: Locale): string {
  const p = a.payload as Record<string, unknown>;
  const str = (v: unknown) => (v === null || v === undefined || v === "" ? "–" : String(v));
  switch (a.type) {
    case "created": return t.activity.created;
    case "title": return t.activity.title(str(p.to));
    case "description": return t.activity.description;
    case "status": return t.activity.status(str(p.from), str(p.to));
    case "priority": return t.activity.priority(t.priority[(["none", "low", "medium", "high", "urgent"] as const)[Number(p.to)] ?? "none"]);
    case "assignee": return p.to ? t.activity.assignee(str(p.to)) : t.activity.unassigned;
    case "due": return p.to ? t.activity.due(new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "UTC" }).format(new Date(`${String(p.to)}T00:00:00Z`))) : t.activity.dueRemoved;
    case "labels": return t.activity.labels((p.added as string[]) ?? [], (p.removed as string[]) ?? []);
    case "subtask_added": return t.activity.subtask_added(str(p.title));
    case "subtask_done": return t.activity.subtask_done(str(p.title));
    case "subtask_reopened": return t.activity.subtask_reopened(str(p.title));
    case "subtask_removed": return t.activity.subtask_removed(str(p.title));
    case "attachment_added": return t.activity.attachment_added(str(p.fileName));
    case "attachment_removed": return t.activity.attachment_removed(str(p.fileName));
    case "imported": return t.activity.imported(str(p.source), p.ref ? String(p.ref) : "");
    case "type": return t.activity.type(isTicketType(p.from) ? t.hierarchy.types[p.from] : str(p.from), isTicketType(p.to) ? t.hierarchy.types[p.to] : str(p.to));
    case "parent": return p.to ? t.activity.parent(str(p.to)) : t.activity.parentRemoved;
    case "checklist_converted": return t.activity.checklist_converted(str(p.title), str(p.key));
    default: return a.type;
  }
}

function Activity({ workspaceId, ticketId }: { workspaceId: string; ticketId: string }) {
  const t = useT(MESSAGES);
  const locale = useLocale();
  const { data, isError } = useActivity(workspaceId, ticketId);
  return (
    <section>
      {isError ? <p className="text-xs text-prio-urgent-ink">{t.detail.activityError}</p> : null}
      <ol className="flex flex-col gap-1.5 border-l border-border pl-3 text-xs">
        {(data ?? []).map((a) => (
          <li key={a.id}>
            <span className="font-medium">{a.actorName ?? t.activity.someone}</span> {describe(a, t, locale)}
            {a.via === "mcp" ? <span className="text-muted"> {t.activity.viaClaude}</span> : null}
            <span className="text-muted"> · <time dateTime={a.createdAt}>{relativeTime(a.createdAt, undefined, locale)}</time></span>
          </li>
        ))}
      </ol>
    </section>
  );
}
