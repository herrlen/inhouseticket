"use client";

import type { TicketRow } from "@/db/queries/tickets";
import { cn } from "@/lib/cn";
import { de } from "@/lib/i18n/de";
import { useProjectInfo } from "./context";
import { Avatar } from "@/components/ui/avatar";
import { dueBucket, formatDue, priorityKey, type Group } from "./list-model";
import { AssigneePicker, DueDateInput, PriorityIcon, PriorityPicker, StatusDot, StatusPicker } from "./pickers";
import { TicketMeta } from "./ticket-meta";
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
};

export function TicketList({ groups, showGroupHeaders, selected, onToggleSelect, onOpen, onPatch, today, openTicketId }: Props) {
  const { project, statuses, labels, members } = useProjectInfo();
  const doneIds = new Set(statuses.filter((s) => s.category === "done").map((s) => s.id));

  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-border bg-surface">
      <table className="w-full border-collapse text-[13px] md:min-w-[760px]">
        <caption className="sr-only">{de.project.tableCaption(project.name)}</caption>
        <thead className="text-left text-xs text-muted">
          <tr className="border-b border-border">
            <th scope="col" className="w-9 px-3 py-2">
              <span className="sr-only">{de.list.select}</span>
            </th>
            <th scope="col" className="w-20 py-2 font-medium">{de.project.colKey}</th>
            <th scope="col" className="py-2 font-medium">{de.project.colTitle}</th>
            <th scope="col" className="w-36 hidden py-2 font-medium md:table-cell">{de.project.colStatus}</th>
            <th scope="col" className="w-32 hidden py-2 font-medium md:table-cell">{de.project.colPriority}</th>
            <th scope="col" className="w-40 hidden py-2 font-medium md:table-cell">{de.list.colAssignee}</th>
            <th scope="col" className="w-36 hidden py-2 font-medium md:table-cell">{de.list.colDue}</th>
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
                      aria-label={de.list.selectGroup(g.label)}
                      className="size-4 accent-[var(--accent)]"
                    />
                  </td>
                  <th scope="rowgroup" colSpan={6} className="py-1.5 text-left text-xs font-semibold">
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
                  <td colSpan={6} className="py-2 text-xs text-muted">{de.list.emptyGroup}</td>
                </tr>
              ) : null}
              {g.tickets.map((t) => {
                const pending = t.id.startsWith("temp-");
                const key = pending ? `${project.key}-…` : `${project.key}-${t.number}`;
                const overdue = dueBucket(t.dueDate, today, doneIds.has(t.statusId)) === "overdue";
                const ticketLabels = labels.filter((l) => t.labelIds.includes(l.id));
                return (
                  <tr
                    key={t.id}
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
                        aria-label={de.list.selectTicket(key)}
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
                        aria-label={de.list.open(key, t.title)}
                      >
                        <span className="truncate">{t.title}</span>
                        {ticketLabels.map((l) => (
                          <span key={l.id} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-1.5 text-[11px] text-muted">
                            <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: l.color }} />
                            {l.name}
                          </span>
                        ))}
                        <TicketMeta subtaskDone={t.subtaskDone} subtaskTotal={t.subtaskTotal} commentCount={t.commentCount} attachmentCount={t.attachmentCount} className="ml-auto" />
                      </button>
                      {/* Phones: the four columns as one read-only line; editing happens in the opened ticket. */}
                      {pending ? null : <MobileMeta ticket={t} statuses={statuses} members={members} overdue={overdue} />}
                    </td>
                    {pending ? (
                      <td colSpan={4} className="hidden py-1 text-xs text-muted md:table-cell">{de.list.saving}</td>
                    ) : (
                      <>
                        <td className="hidden py-1 md:table-cell"><StatusPicker value={t.statusId} ticketLabel={key} onChange={(statusId) => onPatch(t.id, { statusId })} /></td>
                        <td className="hidden py-1 md:table-cell"><PriorityPicker value={t.priority} ticketLabel={key} onChange={(priority) => onPatch(t.id, { priority })} /></td>
                        <td className="hidden py-1 md:table-cell"><AssigneePicker value={t.assigneeId} ticketLabel={key} onChange={(assigneeId) => onPatch(t.id, { assigneeId })} /></td>
                        <td className="hidden py-1 md:table-cell"><DueDateInput value={t.dueDate} ticketLabel={key} overdue={overdue} onChange={(dueDate) => onPatch(t.id, { dueDate })} /></td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}

function MobileMeta({ ticket, statuses, members, overdue }: { ticket: TicketRow; statuses: ReturnType<typeof useProjectInfo>["statuses"]; members: ReturnType<typeof useProjectInfo>["members"]; overdue: boolean }) {
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
          {de.priority[priorityKey(ticket.priority)]}
        </span>
      ) : null}
      {assignee ? (
        <span className="inline-flex items-center gap-1">
          <Avatar user={assignee} size="sm" />
          {assignee.name}
        </span>
      ) : null}
      {ticket.dueDate ? <span className={cn(overdue && "font-medium text-prio-urgent-ink")}>{formatDue(ticket.dueDate)}</span> : null}
    </div>
  );
}
