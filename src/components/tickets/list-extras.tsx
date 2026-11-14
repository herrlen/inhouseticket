"use client";

import { useState } from "react";
import { ChevronDown, Plus } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/client";
import type { Messages } from "@/lib/i18n/de";
import { LIST_COLUMNS, type ListColumn } from "./list-columns";
import deList from "@/lib/i18n/de/list";
import deProject from "@/lib/i18n/de/project";

const MESSAGES = { list: deList, project: deProject };

// Small additions to the list view (docs/ONBOARDING.md §4): add a ticket at the end of a status
// group, a new status at the end of the list (admins), subtasks unfolded under a ticket and the
// toolbar switches "Erledigte anzeigen", "Unteraufgaben anzeigen" and the column chooser.

export const ghostRow = "inline-flex items-center gap-1.5 rounded-[var(--radius-badge)] px-2 py-1 text-sm text-muted hover:bg-hover hover:text-text";

/** "+ Ticket hinzufügen" at the end of a status group; Enter creates, the field stays for the next one. */
export function AddTicketRow({ statusName, colSpan, onCreate }: { statusName: string; colSpan: number; onCreate: (title: string) => void }) {
  const t = useT(MESSAGES).list;
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  return (
    <tr>
      <td />
      <td colSpan={colSpan} className="py-1">
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
            className="h-8 w-full max-w-md rounded-[var(--radius-field)] border border-border bg-content px-2 text-sm placeholder:text-muted"
          />
        ) : (
          <button type="button" onClick={() => setOpen(true)} aria-label={t.addTicketIn(statusName)} className={cn(ghostRow, "-ml-2")}>
            <Plus size={14} />
            {t.addTicket}
          </button>
        )}
      </td>
    </tr>
  );
}

const COLUMN_LABEL = (t: Pick<Messages, "list" | "project">, c: ListColumn) =>
  ({ status: t.project.colStatus, priority: t.project.colPriority, assignee: t.list.colAssignee, due: t.list.colDue, comments: t.list.colComments })[c];

/** Toolbar switches of the list as borderless chips: done tickets, subtasks, columns. */
export function ListOptions(props: {
  chip: (active: boolean) => string;
  showDone: boolean;
  onShowDone: (on: boolean) => void;
  showSubtasks: boolean;
  onShowSubtasks: (on: boolean) => void;
  hidden: ListColumn[];
  onHidden: (columns: ListColumn[]) => void;
}) {
  const t = useT(MESSAGES);
  // The toolbar wraps on narrower screens: when "Spalten" lands in the left half, a right-aligned
  // menu would reach under the sidebar – open it towards the right there.
  const [alignLeft, setAlignLeft] = useState(false);
  return (
    <>
      <label className={cn(props.chip(props.showDone), "cursor-pointer")}>
        <input type="checkbox" checked={props.showDone} onChange={(e) => props.onShowDone(e.target.checked)} className="size-4 accent-[var(--accent)]" />
        {t.list.showDone}
      </label>
      <label className={cn(props.chip(props.showSubtasks), "cursor-pointer")}>
        <input type="checkbox" checked={props.showSubtasks} onChange={(e) => props.onShowSubtasks(e.target.checked)} className="size-4 accent-[var(--accent)]" />
        {t.list.showSubtasks}
      </label>
      <details
        className="relative hidden md:block"
        onToggle={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          if (e.currentTarget.open) setAlignLeft(box.left + box.width / 2 < window.innerWidth / 2);
        }}
      >
        <summary className={cn(props.chip(props.hidden.length > 0), "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
          {t.list.columns}
          <ChevronDown size={14} />
        </summary>
        <fieldset className={cn("absolute z-20 mt-1", alignLeft ? "left-0" : "right-0", "flex min-w-44 flex min-w-44 flex-col gap-1.5 rounded-[var(--radius-card)] border border-border bg-surface p-3 shadow-float")}>
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
