import { compareKeys, keyForIndex } from "@/lib/fractional";
import type { StatusOption } from "./list-model";

// Pure board logic (unit-tested): columns, drop targets, new status + sort key, WIP state.

export type BoardCard = { id: string; statusId: string; sort: string };

export const cardDndId = (id: string) => `card:${id}`;
export const columnDndId = (statusId: string) => `col:${statusId}`;

export function parseBoardId(id: string): { kind: "card" | "column"; id: string } | null {
  if (id.startsWith("card:")) return { kind: "card", id: id.slice(5) };
  if (id.startsWith("col:")) return { kind: "column", id: id.slice(4) };
  return null;
}

export function columnCards<T extends BoardCard>(cards: readonly T[], statusId: string): T[] {
  return cards.filter((c) => c.statusId === statusId).sort((a, b) => compareKeys(a.sort, b.sort));
}

export function orderedStatuses(statuses: readonly StatusOption[]): StatusOption[] {
  return [...statuses].sort((a, b) => compareKeys(a.sort, b.sort));
}

export type CardMove = { ticketId: string; statusId: string; sort: string };

/**
 * Drop `activeId` on `overDndId`:
 * - on a card: that card's column, at its position (moving down lands after it, up before it)
 * - on a column: end of that column
 */
export function computeCardMove<T extends BoardCard>(cards: readonly T[], activeId: string, overDndId: string): CardMove | null {
  const active = cards.find((c) => c.id === activeId);
  const over = parseBoardId(overDndId);
  if (!active || !over) return null;

  if (over.kind === "column") {
    const others = columnCards(cards, over.id).filter((c) => c.id !== activeId);
    if (active.statusId === over.id && others.length === columnCards(cards, over.id).length - 1) {
      // Already in this column: only move if it is not the last card already.
      const col = columnCards(cards, over.id);
      if (col.at(-1)?.id === activeId) return null;
    }
    return { ticketId: activeId, statusId: over.id, sort: keyForIndex(others.map((c) => c.sort), others.length) };
  }

  if (over.id === activeId) return null;
  const target = cards.find((c) => c.id === over.id);
  if (!target) return null;
  const column = columnCards(cards, target.statusId);
  const others = column.filter((c) => c.id !== activeId);
  const overIndex = others.findIndex((c) => c.id === target.id);
  let index = overIndex;
  if (active.statusId === target.statusId) {
    const from = column.findIndex((c) => c.id === activeId);
    const to = column.findIndex((c) => c.id === target.id);
    index = from < to ? overIndex + 1 : overIndex;
  }
  return { ticketId: activeId, statusId: target.statusId, sort: keyForIndex(others.map((c) => c.sort), index) };
}

export function applyCardMove<T extends BoardCard>(cards: readonly T[], move: CardMove): T[] {
  return cards.map((c) => (c.id === move.ticketId ? { ...c, statusId: move.statusId, sort: move.sort } : c));
}

export type WipState = "none" | "ok" | "full" | "over";

export function wipState(count: number, limit: number | null | undefined): WipState {
  if (!limit) return "none";
  if (count > limit) return "over";
  if (count === limit) return "full";
  return "ok";
}
