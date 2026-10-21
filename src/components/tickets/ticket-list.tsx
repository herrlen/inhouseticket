"use client";

import { Fragment } from "react";
import type { TicketRow } from "@/db/queries/tickets";
import { cn } from "@/lib/cn";
import { useLocale, useT } from "@/lib/i18n/client";
import { useProjectInfo } from "./context";
import { Avatar } from "@/components/ui/avatar";
import { dueBucket, formatDue, priorityKey, type Group } from "./list-model";
import { AssigneePicker, DueDateInput, PriorityIcon, PriorityPicker, StatusDot, StatusPicker } from "./pickers";
import { TicketMeta } from "./ticket-meta";
import type { ListColumn } from "./list-columns";
import dynamic from "next/dynamic";
import { AddTicketRow } from "./list-extras";
import deList from "@/lib/i18n/de/list";
import deMeta from "@/lib/i18n/de/meta";
import dePriority from "@/lib/i18n/de/priority";
import deProject from "@/lib/i18n/de/project";

const MESSAGES = { list: deList, meta: deMeta, priority: dePriority, project: deProject };

const SubtaskRows = dynamic(() => import("./list-lazy").then((m) => m.SubtaskRows));
import type { TicketPatch } from "@/lib/validation/ticket";

type Props = {
  groups: Group<TicketRow>[];
  showGroupHeaders: boolean;
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

export function TicketList({ groups, showGroupHeaders, selected, onToggleSelect, onOpen, onPatch, today, openTicketId, hidden = [], onAddToGroup, showSubtasks }: Props) {
  const t = useT(MESSAGES);
  const tl = t.list; // `t` is the ticket inside the row loop
  const tm = t.meta;
  const { workspaceId, project, statuses, labels, members } = useProjectInfo();
  const doneIds = new Set(statuses.filter((s) => s.category === "done").map((s) => s.id));
  const show = (c: ListColumn) => !hidden.includes(c);
  const dataCols = (["status", "priority", "assignee", "due", "comments"] as const).filter(show);
  // Everything after the checkbox: key, title and the visible data columns.
  const span = 2 + dataCols.length;

  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-border bg-surface">
      <table className="w-full border-collapse text-[13px] md:min-w-[760px]">
        <caption className="sr-only">{t.project.tableCaption(project.name)}</caption>
        <thead className="text-left text-xs text-muted">
          <tr className="border-b border-border">
            <th scope="col" className="w-9 px-3 py-2">
              <span className="sr-only">{t.list.select}</span>
            </th>
            <th scope="col" className="w-20 py-2 font-medium">{t.project.colKey}</th>
            <th scope="col" className="py-2 font-medium">{t.project.colTitle}</th>
            {show("status") ? <th scope="col" className="w-36 hidden py-2 font-medium md:table-cell">{t.project.colStatus}</th> : null}
            {show("priority") ? <th scope="col" className="w-32 hidden py-2 font-medium md:table-cell">{t.project.colPriority}</th> : null}
            {show("assignee") ? <th scope="col" className="w-40 hidden py-2 font-medium md:table-cell">{t.list.colAssignee}</th> : null}
            {show("due") ? <th scope="col" className="w-36 hidden py-2 font-medium md:table-cell">{t.list.colDue}</th> : null}
            {show("comments") ? <th scope="col" className="w-24 hidden py-2 pr-3 text-right font-medium md:table-cell">{t.list.colComments}</th> : null}
          </tr>
        </thead>
        {groups.map((g) => {
          const ids = g.tickets.filter((t) => !t.id.startsWith("temp-")).map((t) => t.id);
          const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
          return (
            <tbody key={g.key}>
              {showGroupHeaders ? (
                <tr className="border-b border-border bg-bg/60">
                  <td className="px-3 py-1.5">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      disabled={ids.length === 0}
                      onChange={(e) => onToggleSelect(ids, e.target.checked)}
                      aria-label={t.list.selectGroup(g.label)}
                      className="size-4 accent-[var(--accent)]"
                    />
                  </td>
                  <th scope="rowgroup" colSpan={span} className="py-1.5 text-left text-xs font-semibold">
                    <span className="inline-flex items-center gap-2">
                      {g.color ? <StatusDot color={g.color} /> : null}
                      {g.label}
                      <span className="font-normal text-muted">{g.tickets.length}</span>
                    </span>
                  </th>
                </tr>
              ) : null}
              {g.tickets.length === 0 && showGroupHeaders ? (
                <tr className="border-b border-border">
                  <td />
                  <td colSpan={span} className="py-2 text-xs text-muted">{t.list.emptyGroup}</td>
                </tr>
              ) : null}
              {g.tickets.map((t) => {
                const pending = t.id.startsWith("temp-");
                const key = pending ? `${project.key}-…` : `${project.key}-${t.number}`;
                const overdue = dueBucket(t.dueDate, today, doneIds.has(t.statusId)) === "overdue";
                const ticketLabels = labels.filter((l) => t.labelIds.includes(l.id));
                return (
                  <Fragment key={t.id}>
                  <tr
                    data-ticket-row={t.id}
                    aria-selected={selected.has(t.id)}
                    className={cn(
                      "border-b border-border last:border-0 hover:bg-bg/60",
                      // Neutral backgrounds keep muted text at ≥ 4.5:1 (an accent tint fell below, axe);
                      // the open ticket is marked with an accent bar instead.
                      selected.has(t.id) && "bg-bg",
                      openTicketId === t.id && "bg-bg shadow-[inset_3px_0_0_var(--accent)]",
                      pending && "opacity-60",
                    )}
                  >
                    <td className="px-3 py-1">
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
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => onOpen(t.id)}
                        className="flex w-full min-w-0 items-center gap-2 text-left hover:underline"
                        aria-label={tl.open(key, t.title)}
                      >
                        <span className="truncate">{t.title}</span>
                        {ticketLabels.map((l) => (
                          <span key={l.id} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-1.5 text-[11px] text-muted">
                            <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: l.color }} />
                            {l.name}
                          </span>
                        ))}
                        <TicketMeta subtaskDone={t.subtaskDone} subtaskTotal={t.subtaskTotal} commentCount={show("comments") ? 0 : t.commentCount} attachmentCount={t.attachmentCount} className="ml-auto" />
                      </button>
                      {/* Phones: the four columns as one read-only line; editing happens in the opened ticket. */}
                      {pending ? null : <MobileMeta ticket={t} statuses={statuses} members={members} overdue={overdue} />}
                    </td>
                    {pending ? (
                      dataCols.length > 0 ? <td colSpan={dataCols.length} className="hidden py-1 text-xs text-muted md:table-cell">{tl.saving}</td> : null
                    ) : (
                      <>
                        {show("status") ? <td className="hidden py-1 md:table-cell"><StatusPicker value={t.statusId} ticketLabel={key} onChange={(statusId) => onPatch(t.id, { statusId })} /></td> : null}
                        {show("priority") ? <td className="hidden py-1 md:table-cell"><PriorityPicker value={t.priority} ticketLabel={key} onChange={(priority) => onPatch(t.id, { priority })} /></td> : null}
                        {show("assignee") ? <td className="hidden py-1 md:table-cell"><AssigneePicker value={t.assigneeId} ticketLabel={key} onChange={(assigneeId) => onPatch(t.id, { assigneeId })} /></td> : null}
                        {show("due") ? <td className="hidden py-1 md:table-cell"><DueDateInput value={t.dueDate} ticketLabel={key} overdue={overdue} onChange={(dueDate) => onPatch(t.id, { dueDate })} /></td> : null}
                        {show("comments") ? (
                          <td className="hidden py-1 pr-3 text-right text-xs text-muted tabular-nums md:table-cell">
                            {t.commentCount > 0 ? (
                              <>
                                <span aria-hidden>{t.commentCount}</span>
                                <span className="sr-only">{tm.comments(t.commentCount)}</span>
                              </>
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
              {onAddToGroup && showGroupHeaders ? (
                <AddTicketRow statusName={g.label} colSpan={span} onCreate={(title) => onAddToGroup(g.key, title)} />
              ) : null}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}

function MobileMeta({ ticket, statuses, members, overdue }: { ticket: TicketRow; statuses: ReturnType<typeof useProjectInfo>["statuses"]; members: ReturnType<typeof useProjectInfo>["members"]; overdue: boolean }) {
  const t = useT(MESSAGES);
  const locale = useLocale();
  const status = statuses.find((x) => x.id === ticket.statusId);
  const assignee = members.find((m) => m.id === ticket.assigneeId);
  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted md:hidden">
      {status ? (
        <span className="inline-flex items-center gap-1">
          <StatusDot color={status.color} />
          {status.name}
        </span>
      ) : null}
      {ticket.priority > 0 ? (
        <span className="inline-flex items-center gap-1">
          <PriorityIcon priority={ticket.priority} />
          {t.priority[priorityKey(ticket.priority)]}
        </span>
      ) : null}
      {assignee ? (
        <span className="inline-flex items-center gap-1">
          <Avatar user={assignee} size="sm" />
          {assignee.name}
        </span>
      ) : null}
      {ticket.dueDate ? <span className={cn(overdue && "font-medium text-prio-urgent-ink")}>{formatDue(ticket.dueDate, locale)}</span> : null}
    </div>
  );
}
