"use client";

import dynamic from "next/dynamic";
import { Fragment, useState, type ReactNode } from "react";
import type { TicketRow } from "@/db/queries/tickets";
import { ChevronDown, ChevronRight, CommentIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/client";
import type { TicketPatch } from "@/lib/validation/ticket";
import { useProjectInfo } from "./context";
import { AddTicketRow } from "./list-extras";
import type { ListColumn } from "./list-columns";
import { dueBucket, type Group, type GroupBy } from "./list-model";
import { AssigneePicker, DueDateInput, PriorityPicker, StatusPicker } from "./pickers";
import { DueValue, PersonValue, PriorityValue, StatusLabel } from "./ticket-ui";
import { TicketMeta } from "./ticket-meta";
import { TypeIcon } from "./type-icon";
import deList from "@/lib/i18n/de/list";
import deMeta from "@/lib/i18n/de/meta";
import deProject from "@/lib/i18n/de/project";

const MESSAGES = { list: deList, meta: deMeta, project: deProject };

const SubtaskRows = dynamic(() => import("./list-lazy").then((m) => m.SubtaskRows));

type Props = {
  groups: Group<TicketRow>[];
  groupBy: GroupBy;
  selected: Set<string>;
  onToggleSelect: (ids: string[], select: boolean) => void;
  onOpen: (ticketId: string) => void;
  onPatch: (ticketId: string, patch: TicketPatch) => void;
  today: string;
  openTicketId: string | null;
  /** Columns the person switched off. */
  hidden?: readonly ListColumn[];
  /** Status grouping only: "+ Ticket hinzufügen" at the end of each group. */
  onAddToGroup?: (statusId: string, title: string) => void;
  /** Unfold the subtasks under each ticket that has some. */
  showSubtasks?: boolean;
};

/**
 * The list (Redesign X2, like emuchat): grouped, each group header with its colored label, the count
 * and a collapse toggle; 40 px rows with only a subtle bottom line; values are borderless chips.
 */
export function TicketList({ groups, groupBy, selected, onToggleSelect, onOpen, onPatch, today, openTicketId, hidden = [], onAddToGroup, showSubtasks }: Props) {
  const t = useT(MESSAGES);
  const tl = t.list; // `t` is the ticket inside the row loop
  const tm = t.meta;
  const { workspaceId, project, statuses, labels, members } = useProjectInfo();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const showGroupHeaders = groupBy !== "none";
  const doneIds = new Set(statuses.filter((s) => s.category === "done").map((s) => s.id));
  const numberOf = new Map(groups.flatMap((g) => g.tickets.map((x) => [x.id, x.number] as const)));
  const show = (c: ListColumn) => !hidden.includes(c);
  const dataCols = (["status", "assignee", "due", "priority", "comments"] as const).filter(show);
  // Everything after the checkbox: key, title and the visible data columns.
  const span = 2 + dataCols.length;
  const head = "py-2 text-left text-xs font-medium text-muted";

  /** The group's label in the look of its values: status label, priority flag, person. */
  const groupLabel = (g: Group<TicketRow>): ReactNode => {
    if (groupBy === "status") {
      const status = statuses.find((s) => s.id === g.key);
      if (status) return <StatusLabel status={status} />;
    }
    if (groupBy === "priority") return <PriorityValue value={Number(g.key.slice(1))} showNone />;
    if (groupBy === "assignee") return <PersonValue person={members.find((m) => m.id === g.key) ?? null} />;
    return <span className="text-sm font-semibold">{g.label}</span>;
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm md:min-w-[760px]">
        <caption className="sr-only">{t.project.tableCaption(project.name)}</caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="w-9 py-2 pr-2 pl-1">
              <span className="sr-only">{t.list.select}</span>
            </th>
            <th scope="col" className={cn(head, "w-20")}>{t.project.colKey}</th>
            <th scope="col" className={head}>{t.project.colTitle}</th>
            {show("status") ? <th scope="col" className={cn(head, "hidden w-36 md:table-cell")}>{t.project.colStatus}</th> : null}
            {show("assignee") ? <th scope="col" className={cn(head, "hidden w-40 md:table-cell")}>{t.list.colAssignee}</th> : null}
            {show("due") ? <th scope="col" className={cn(head, "hidden w-32 md:table-cell")}>{t.list.colDue}</th> : null}
            {show("priority") ? <th scope="col" className={cn(head, "hidden w-32 md:table-cell")}>{t.project.colPriority}</th> : null}
            {show("comments") ? <th scope="col" className={cn(head, "hidden w-24 pr-2 text-right md:table-cell")}>{t.list.colComments}</th> : null}
          </tr>
        </thead>
        {groups.map((g) => {
          const ids = g.tickets.filter((t) => !t.id.startsWith("temp-")).map((t) => t.id);
          const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
          const closed = showGroupHeaders && collapsed.has(g.key);
          const canAdd = Boolean(onAddToGroup) && showGroupHeaders;
          return (
            <tbody key={g.key}>
              {showGroupHeaders ? (
                <tr>
                  <td className="pt-5 pr-2 pb-2 pl-1 align-middle">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      disabled={ids.length === 0}
                      onChange={(e) => onToggleSelect(ids, e.target.checked)}
                      aria-label={t.list.selectGroup(g.label)}
                      className="size-4 accent-[var(--accent)]"
                    />
                  </td>
                  <th scope="rowgroup" colSpan={span} className="pt-5 pb-2 text-left font-normal">
                    <button
                      type="button"
                      aria-expanded={!closed}
                      onClick={() =>
                        setCollapsed((prev) => {
                          const next = new Set(prev);
                          if (next.has(g.key)) next.delete(g.key);
                          else next.add(g.key);
                          return next;
                        })
                      }
                      className="-ml-1 inline-flex max-w-full items-center gap-2 rounded-[var(--radius-badge)] px-1 py-0.5 hover:bg-hover"
                    >
                      {closed ? <ChevronRight size={14} className="shrink-0 text-muted" /> : <ChevronDown size={14} className="shrink-0 text-muted" />}
                      {groupLabel(g)}
                      <span className="text-sm text-muted tabular-nums">{g.tickets.length}</span>
                    </button>
                  </th>
                </tr>
              ) : null}
              {!closed && g.tickets.length === 0 && showGroupHeaders && !canAdd ? (
                <tr className="border-b border-border-subtle">
                  <td />
                  <td colSpan={span} className="py-2 text-xs text-muted">{t.list.emptyGroup}</td>
                </tr>
              ) : null}
              {closed
                ? null
                : g.tickets.map((t) => {
                    const pending = t.id.startsWith("temp-");
                    const key = pending ? `${project.key}-…` : `${project.key}-${t.number}`;
                    const done = doneIds.has(t.statusId);
                    const overdue = dueBucket(t.dueDate, today, done) === "overdue";
                    const ticketLabels = labels.filter((l) => t.labelIds.includes(l.id));
                    const isOpen = openTicketId === t.id;
                    const parentNumber = t.parentId ? numberOf.get(t.parentId) : undefined;
                    return (
                      <Fragment key={t.id}>
                        <tr
                          data-ticket-row={t.id}
                          aria-selected={selected.has(t.id)}
                          className={cn(
                            "h-10 border-b border-border-subtle",
                            // Selected and open rows are tinted (muted text stays ≥ 4.5:1 there, tokens.test.ts);
                            // the open ticket also gets the accent bar.
                            selected.has(t.id) || isOpen ? "bg-accent-soft" : "hover:bg-hover",
                            isOpen && "shadow-[inset_3px_0_0_var(--accent)]",
                            pending && "opacity-60",
                          )}
                        >
                          <td className="py-1 pr-2 pl-1">
                            <input
                              type="checkbox"
                              checked={selected.has(t.id)}
                              disabled={pending}
                              onChange={(e) => onToggleSelect([t.id], e.target.checked)}
                              aria-label={tl.selectTicket(key)}
                              className="size-4 accent-[var(--accent)]"
                            />
                          </td>
                          <td className="py-1 pr-2 font-mono text-xs whitespace-nowrap text-muted">{key}</td>
                          <td className="py-1 pr-3 max-md:w-full max-md:max-w-0">
                            <div className="flex min-w-0 items-center gap-2">
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => onOpen(t.id)}
                                className="flex min-w-0 items-center gap-2 rounded-[var(--radius-badge)] text-left hover:underline"
                                aria-label={tl.open(key, t.title)}
                                aria-describedby={`type-${t.id}`}
                              >
                                {/* The button's name is key + title; the type is its description (aria-describedby). */}
                                <TypeIcon type={t.type} id={`type-${t.id}`} />
                                <span className={cn("truncate", done ? "text-muted line-through" : isOpen ? "font-semibold" : "font-medium")}>{t.title}</span>
                              </button>
                              {!show("comments") && t.commentCount > 0 ? (
                                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted tabular-nums">
                                  <CommentIcon size={14} />
                                  {t.commentCount}
                                  <span className="sr-only"> {tm.comments(t.commentCount)}</span>
                                </span>
                              ) : null}
                              <TicketMeta subtaskDone={t.subtaskDone} subtaskTotal={t.subtaskTotal} commentCount={0} attachmentCount={t.attachmentCount} />
                              {parentNumber !== undefined ? <span className="hidden shrink-0 font-mono text-xs text-muted lg:inline">↳ {project.key}-{parentNumber}</span> : null}
                              {ticketLabels.map((l) => (
                                <span key={l.id} className="hidden shrink-0 items-center gap-1 rounded-full border border-border px-1.5 text-[11px] text-muted sm:inline-flex">
                                  <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: l.color }} />
                                  {l.name}
                                </span>
                              ))}
                            </div>
                            {/* Phones: the columns as one read-only line; editing happens in the opened ticket. */}
                            {pending ? null : <MobileMeta ticket={t} today={today} done={done} />}
                          </td>
                          {pending ? (
                            dataCols.length > 0 ? <td colSpan={dataCols.length} className="hidden py-1 text-xs text-muted md:table-cell">{tl.saving}</td> : null
                          ) : (
                            <>
                              {show("status") ? <td className="hidden py-1 pr-2 md:table-cell"><StatusPicker value={t.statusId} ticketLabel={key} onChange={(statusId) => onPatch(t.id, { statusId })} /></td> : null}
                              {show("assignee") ? <td className="hidden py-1 pr-2 md:table-cell"><AssigneePicker value={t.assigneeId} ticketLabel={key} onChange={(assigneeId) => onPatch(t.id, { assigneeId })} /></td> : null}
                              {show("due") ? <td className="hidden py-1 pr-2 md:table-cell"><DueDateInput value={t.dueDate} today={today} done={done} ticketLabel={key} overdue={overdue} onChange={(dueDate) => onPatch(t.id, { dueDate })} /></td> : null}
                              {show("priority") ? <td className="hidden py-1 pr-2 md:table-cell"><PriorityPicker value={t.priority} ticketLabel={key} onChange={(priority) => onPatch(t.id, { priority })} /></td> : null}
                              {show("comments") ? (
                                <td className="hidden py-1 pr-2 text-right text-xs text-muted tabular-nums md:table-cell">
                                  {t.commentCount > 0 ? (
                                    <span className="inline-flex items-center gap-1">
                                      <CommentIcon size={14} />
                                      <span aria-hidden>{t.commentCount}</span>
                                      <span className="sr-only">{tm.comments(t.commentCount)}</span>
                                    </span>
                                  ) : (
                                    <span aria-hidden>–</span>
                                  )}
                                </td>
                              ) : null}
                            </>
                          )}
                        </tr>
                        {showSubtasks && !pending && t.subtaskTotal > 0 ? <SubtaskRows workspaceId={workspaceId} ticketId={t.id} ticketKey={key} colSpan={span} /> : null}
                      </Fragment>
                    );
                  })}
              {!closed && canAdd && onAddToGroup ? <AddTicketRow statusName={g.label} colSpan={span} onCreate={(title) => onAddToGroup(g.key, title)} /> : null}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}

function MobileMeta({ ticket, today, done }: { ticket: TicketRow; today: string; done: boolean }) {
  const { statuses, members } = useProjectInfo();
  const status = statuses.find((x) => x.id === ticket.statusId);
  const assignee = members.find((m) => m.id === ticket.assigneeId);
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs md:hidden">
      {status ? <StatusLabel status={status} /> : null}
      {ticket.priority > 0 ? <PriorityValue value={ticket.priority} /> : null}
      {assignee ? <PersonValue person={assignee} /> : null}
      {ticket.dueDate ? <DueValue date={ticket.dueDate} today={today} done={done} /> : null}
    </div>
  );
}
