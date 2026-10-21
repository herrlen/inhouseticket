"use client";

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useId, useState } from "react";
import type { TicketRow } from "@/db/queries/tickets";
import { Avatar } from "@/components/ui/avatar";
import { Plus } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { useLocale, useT } from "@/lib/i18n/client";
import { MAX_TITLE } from "@/lib/limits";
import { cardDndId, columnCards, columnDndId, computeCardMove, orderedStatuses, parseBoardId, wipState, type CardMove } from "./board-model";
import { useProjectInfo } from "./context";
import { dueBucket, priorityKey } from "./list-model";
import { formatDue, PriorityIcon, StatusDot } from "./pickers";
import { TicketMeta } from "./ticket-meta";
import deBoard from "@/lib/i18n/de/board";
import deList from "@/lib/i18n/de/list";
import dePriority from "@/lib/i18n/de/priority";

const MESSAGES = { board: deBoard, list: deList, priority: dePriority };

/**
 * ←/→ jump straight to the neighbouring column (top of its list); ↑/↓ move within a column.
 * dnd-kit's default getter picks the nearest corner, which first lands on the card below.
 */
const boardKeyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
  if (event.code !== "ArrowLeft" && event.code !== "ArrowRight") return sortableKeyboardCoordinates(event, args);
  event.preventDefault();
  const { collisionRect, droppableRects, droppableContainers } = args.context;
  if (!collisionRect) return undefined;
  const columns = droppableContainers
    .getEnabled()
    .filter((c) => String(c.id).startsWith("col:"))
    .map((c) => ({ id: c.id, rect: droppableRects.get(c.id) }))
    .filter((c): c is { id: typeof c.id; rect: NonNullable<typeof c.rect> } => Boolean(c.rect))
    .sort((a, b) => a.rect.left - b.rect.left);
  const center = collisionRect.left + collisionRect.width / 2;
  let index = columns.findIndex((c) => center >= c.rect.left && center <= c.rect.left + c.rect.width);
  if (index < 0) index = columns.reduce((best, c, i) => (Math.abs(c.rect.left - center) < Math.abs(columns[best]!.rect.left - center) ? i : best), 0);
  const target = columns[index + (event.code === "ArrowRight" ? 1 : -1)];
  if (!target) return undefined;
  return { x: target.rect.left + (target.rect.width - collisionRect.width) / 2, y: target.rect.top + 4 };
};

type Props = {
  tickets: TicketRow[];
  today: string;
  onOpen: (ticketId: string) => void;
  onMove: (move: CardMove, dropRect: DOMRect | null) => void;
  onCreate: (title: string, statusId: string) => void;
};

export function Board({ tickets, today, onOpen, onMove, onCreate }: Props) {
  const t = useT(MESSAGES);
  const { statuses, project } = useProjectInfo();
  const dndId = useId();
  const [activeId, setActiveId] = useState<string | null>(null);
  const columns = orderedStatuses(statuses);
  const cards = tickets.filter((t) => !t.id.startsWith("temp-") || t.statusId);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // Space picks up a card; Enter stays free for opening it.
    useSensor(KeyboardSensor, { coordinateGetter: boardKeyboardCoordinates, keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] } }),
  );

  const keyOf = (id: string) => {
    const t = tickets.find((x) => x.id === id);
    return t ? `${project.key}-${t.number}` : "";
  };
  const describe = (dndId: string | number) => {
    const ref = parseBoardId(String(dndId));
    if (!ref) return "";
    if (ref.kind === "column") return t.board.column(statuses.find((s) => s.id === ref.id)?.name ?? "");
    return keyOf(ref.id);
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => t.board.dnd.start(describe(active.id)),
    onDragOver: ({ active, over }) => (over ? t.board.dnd.over(describe(active.id), describe(over.id)) : t.board.dnd.outside(describe(active.id))),
    onDragEnd: ({ active, over }) => (over ? t.board.dnd.end(describe(active.id), describe(over.id)) : t.board.dnd.cancel(describe(active.id))),
    onDragCancel: ({ active }) => t.board.dnd.cancel(describe(active.id)),
  };

  function onDragStart(e: DragStartEvent) {
    setActiveId(parseBoardId(String(e.active.id))?.id ?? null);
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    if (!e.over) return;
    const ref = parseBoardId(String(e.active.id));
    if (!ref) return;
    const move = computeCardMove(cards, ref.id, String(e.over.id));
    if (move) onMove(move, e.over.rect ? new DOMRect(e.over.rect.left, e.over.rect.top, e.over.rect.width, e.over.rect.height) : null);
  }

  const activeTicket = activeId ? tickets.find((t) => t.id === activeId) : null;

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
      accessibility={{ announcements, screenReaderInstructions: { draggable: t.board.dnd.instructions } }}
    >
      <div className="-mx-4 snap-x snap-proximity scroll-px-4 overflow-x-auto px-4 pb-4 md:-mx-6 md:snap-none md:px-6">
        <div className="flex min-h-[60vh] gap-3" role="list" aria-label={t.board.label(project.name)}>
          {columns.map((s) => (
            <Column key={s.id} status={s} cards={columnCards(cards, s.id)} today={today} onOpen={onOpen} onCreate={(title) => onCreate(title, s.id)} />
          ))}
        </div>
      </div>
      <DragOverlay dropAnimation={{ duration: 150, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
        {activeTicket ? <CardBody ticket={activeTicket} today={today} lifted /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  status,
  cards,
  today,
  onOpen,
  onCreate,
}: {
  status: ReturnType<typeof orderedStatuses>[number];
  cards: TicketRow[];
  today: string;
  onOpen: (id: string) => void;
  onCreate: (title: string) => void;
}) {
  const t = useT(MESSAGES);
  const { setNodeRef, isOver } = useDroppable({ id: columnDndId(status.id) });
  const wip = wipState(cards.length, status.wipLimit);
  const headingId = `col-${status.id}`;

  return (
    <section
      ref={setNodeRef}
      role="listitem"
      aria-labelledby={headingId}
      className={cn(
        "flex w-72 shrink-0 snap-start flex-col rounded-[var(--radius-card)] border bg-bg/60",
        wip === "over" ? "border-prio-urgent-ink" : "border-border",
        isOver && "ring-2 ring-accent/40",
      )}
    >
      <header className="flex items-center gap-2 px-3 pt-3 pb-2">
        <StatusDot color={status.color} />
        <h2 id={headingId} className="text-[13px] font-semibold">{status.name}</h2>
        <span
          className={cn("ml-auto text-xs tabular-nums", wip === "over" ? "font-semibold text-prio-urgent-ink" : wip === "full" ? "text-prio-high-ink" : "text-muted")}
          aria-label={status.wipLimit ? t.board.wipLabel(cards.length, status.wipLimit) : t.board.countLabel(cards.length)}
        >
          {status.wipLimit ? `${cards.length}/${status.wipLimit}` : cards.length}
        </span>
      </header>
      {wip === "over" ? (
        <p role="status" className="mx-3 mb-2 rounded-[var(--radius-badge)] bg-prio-urgent/10 px-2 py-1 text-xs text-prio-urgent-ink">
          {t.board.wipOver(status.wipLimit!)}
        </p>
      ) : null}
      <SortableContext items={cards.map((c) => cardDndId(c.id))} strategy={verticalListSortingStrategy}>
        <ul className="flex min-h-16 flex-1 flex-col gap-2 px-2 pb-2">
          {cards.map((t) => (
            <SortableCard key={t.id} ticket={t} today={today} onOpen={onOpen} />
          ))}
        </ul>
      </SortableContext>
      <ColumnQuickAdd statusName={status.name} onCreate={onCreate} />
    </section>
  );
}

function SortableCard({ ticket, today, onOpen }: { ticket: TicketRow; today: string; onOpen: (id: string) => void }) {
  const t = useT(MESSAGES);
  const pending = ticket.id.startsWith("temp-");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cardDndId(ticket.id), disabled: pending });
  const { project } = useProjectInfo();
  const key = pending ? `${project.key}-…` : `${project.key}-${ticket.number}`;
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn(isDragging && "opacity-30")}>
      <div
        {...attributes}
        {...listeners}
        role="button"
        aria-roledescription={t.board.cardRole}
        aria-label={t.list.open(key, ticket.title)}
        data-card={ticket.id}
        onClick={() => !pending && onOpen(ticket.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !pending) {
            e.preventDefault();
            onOpen(ticket.id);
            return;
          }
          listeners?.onKeyDown?.(e);
        }}
        className="block cursor-grab rounded-[var(--radius-badge)] focus-visible:outline-offset-1 active:cursor-grabbing"
      >
        <CardBody ticket={ticket} today={today} />
      </div>
    </li>
  );
}

function CardBody({ ticket, today, lifted }: { ticket: TicketRow; today: string; lifted?: boolean }) {
  const t = useT(MESSAGES);
  const locale = useLocale();
  const { project, members, labels, statuses } = useProjectInfo();
  const pending = ticket.id.startsWith("temp-");
  const key = pending ? `${project.key}-…` : `${project.key}-${ticket.number}`;
  const assignee = members.find((m) => m.id === ticket.assigneeId) ?? null;
  const done = statuses.find((s) => s.id === ticket.statusId)?.category === "done";
  const overdue = dueBucket(ticket.dueDate, today, done) === "overdue";
  const ticketLabels = labels.filter((l) => ticket.labelIds.includes(l.id));
  return (
    <div className={cn("flex flex-col gap-2 rounded-[var(--radius-badge)] border border-border bg-surface p-2.5 text-[13px]", lifted && "rotate-1 shadow-float", pending && "opacity-60")}>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] text-muted">{key}</span>
        <span className="ml-auto" title={t.priority[priorityKey(ticket.priority)]}>
          <PriorityIcon priority={ticket.priority} />
          <span className="sr-only">{t.priority[priorityKey(ticket.priority)]}</span>
        </span>
      </div>
      <p className={cn("line-clamp-3", done && "text-muted line-through decoration-muted/50")}>{ticket.title}</p>
      {ticketLabels.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {ticketLabels.map((l) => (
            <span key={l.id} className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 text-[11px] text-muted">
              <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: l.color }} />
              {l.name}
            </span>
          ))}
        </div>
      ) : null}
      {ticket.dueDate || assignee || ticket.subtaskTotal || ticket.commentCount || ticket.attachmentCount ? (
        <div className="flex items-center gap-2 text-xs">
          <TicketMeta subtaskDone={ticket.subtaskDone} subtaskTotal={ticket.subtaskTotal} commentCount={ticket.commentCount} attachmentCount={ticket.attachmentCount} />
          {ticket.dueDate ? (
            <span className={cn(overdue ? "font-medium text-prio-urgent-ink" : "text-muted")}>
              {formatDue(ticket.dueDate, locale)}
              {overdue ? <span className="sr-only"> – {t.list.due.overdue}</span> : null}
            </span>
          ) : null}
          {assignee ? <Avatar user={assignee} size="sm" className="ml-auto" /> : null}
        </div>
      ) : null}
    </div>
  );
}

function ColumnQuickAdd({ statusName, onCreate }: { statusName: string; onCreate: (title: string) => void }) {
  const t = useT(MESSAGES);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-2 mb-2 flex h-8 items-center gap-1.5 rounded-[var(--radius-badge)] px-2 text-[13px] text-muted hover:bg-surface hover:text-text"
        aria-label={t.board.addIn(statusName)}
      >
        <Plus size={14} /> {t.board.add}
      </button>
    );
  }
  return (
    <form
      className="mx-2 mb-2"
      onSubmit={(e) => {
        e.preventDefault();
        const t = title.trim();
        if (t) onCreate(t);
        setTitle("");
      }}
    >
      <label className="sr-only" htmlFor={`add-${statusName}`}>{t.board.addIn(statusName)}</label>
      <textarea
        id={`add-${statusName}`}
        autoFocus
        rows={2}
        value={title}
        maxLength={MAX_TITLE}
        onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))}
        onBlur={() => !title && setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
          if (e.key === "Escape") {
            e.stopPropagation();
            setTitle("");
            setOpen(false);
          }
        }}
        placeholder={t.board.addPlaceholder}
        className="w-full resize-none rounded-[var(--radius-badge)] border border-accent bg-surface p-2 text-[13px] placeholder:text-muted"
      />
    </form>
  );
}
