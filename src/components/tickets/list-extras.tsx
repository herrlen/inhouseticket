"use client";

import { useState } from "react";
import { Plus } from "@/components/ui/icons";
import { useT } from "@/lib/i18n/client";
import type { Messages } from "@/lib/i18n/de";
import { LIST_COLUMNS, type ListColumn } from "./list-columns";
import deList from "@/lib/i18n/de/list";
import deProject from "@/lib/i18n/de/project";

const MESSAGES = { list: deList, project: deProject };

// Small additions to the list view (docs/ONBOARDING.md §4): add a ticket at the end of a status
// group, a new status at the end of the list (admins), subtasks unfolded under a ticket and the
// toolbar switches "Erledigte anzeigen", "Unteraufgaben anzeigen" and the column chooser.

export const ghostRow = "flex items-center gap-1.5 py-1.5 text-xs text-muted hover:text-text";

/** "+ Ticket hinzufügen" at the end of a status group; Enter creates, the field stays for the next one. */
export function AddTicketRow({ statusName, colSpan, onCreate }: { statusName: string; colSpan: number; onCreate: (title: string) => void }) {
  const t = useT(MESSAGES).list;
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  return (
    <tr className="border-b border-border">
      <td />
      <td colSpan={colSpan}>
        {open ? (
          <input
            autoFocus
            value={title}
            maxLength={500}
            aria-label={t.addTicketIn(statusName)}
            placeholder={t.addTicket}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && title.trim()) {
                e.preventDefault();
                onCreate(title.trim());
                setTitle("");
              } else if (e.key === "Escape") {
                setOpen(false);
                setTitle("");
              }
            }}
            onBlur={() => !title.trim() && setOpen(false)}
            className="my-1 h-7 w-full max-w-md rounded-[var(--radius-badge)] border border-border bg-surface px-2 text-[13px]"
          />
        ) : (
          <button type="button" onClick={() => setOpen(true)} aria-label={t.addTicketIn(statusName)} className={ghostRow}>
            <Plus size={12} />
            {t.addTicket}
          </button>
        )}
      </td>
    </tr>
  );
}

const COLUMN_LABEL = (t: Pick<Messages, "list" | "project">, c: ListColumn) =>
  ({ status: t.project.colStatus, priority: t.project.colPriority, assignee: t.list.colAssignee, due: t.list.colDue, comments: t.list.colComments })[c];

/** Toolbar switches of the list: done tickets, subtasks, columns. */
export function ListOptions(props: {
  showDone: boolean;
  onShowDone: (on: boolean) => void;
  showSubtasks: boolean;
  onShowSubtasks: (on: boolean) => void;
  hidden: ListColumn[];
  onHidden: (columns: ListColumn[]) => void;
}) {
  const t = useT(MESSAGES);
  const toggle = "flex items-center gap-1.5 text-[13px] text-muted";
  return (
    <>
      <label className={toggle}>
        <input type="checkbox" checked={props.showDone} onChange={(e) => props.onShowDone(e.target.checked)} className="size-4 accent-[var(--accent)]" />
        {t.list.showDone}
      </label>
      <label className={toggle}>
        <input type="checkbox" checked={props.showSubtasks} onChange={(e) => props.onShowSubtasks(e.target.checked)} className="size-4 accent-[var(--accent)]" />
        {t.list.showSubtasks}
      </label>
      <details className="relative hidden md:block">
        <summary className="flex h-8 cursor-pointer list-none items-center rounded-[var(--radius-badge)] border border-border bg-surface px-2 text-[13px] text-muted hover:text-text">
          {t.list.columns} ▾
        </summary>
        <fieldset className="absolute right-0 z-20 mt-1 flex min-w-44 flex-col gap-1.5 rounded-[var(--radius-card)] border border-border bg-surface p-3 shadow-[var(--shadow-float)]">
          <legend className="sr-only">{t.list.columns}</legend>
          {LIST_COLUMNS.map((c) => (
            <label key={c} className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={!props.hidden.includes(c)}
                onChange={(e) => props.onHidden(e.target.checked ? props.hidden.filter((x) => x !== c) : [...props.hidden, c])}
                className="size-4 accent-[var(--accent)]"
              />
              {COLUMN_LABEL(t, c)}
            </label>
          ))}
        </fieldset>
      </details>
    </>
  );
}
