"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Announcements, DragEndEvent, DragOverEvent } from "@dnd-kit/core";

// Sidebar drag & drop without dnd-kit in the initial bundle: rows render statically (identical on
// server and client, no hydration mismatch) and switch to sortable ones once ./dnd-kit has loaded –
// when the browser is idle, or at the latest when the pointer or focus enters the list.

export type SortableRender = {
  setNodeRef: (el: HTMLElement | null) => void;
  setActivatorNodeRef: (el: HTMLElement | null) => void;
  style?: React.CSSProperties;
  handleProps: Record<string, unknown>;
  isDragging: boolean;
};
export type DndRootProps = {
  id: string;
  onDragOver: (e: DragOverEvent) => void;
  onDragEnd: (e: DragEndEvent) => void;
  onDragCancel: () => void;
  announcements: Announcements;
  instructions: string;
  children: React.ReactNode;
};
export type SortableListProps = { ids: string[]; children: React.ReactNode };
export type SortableItemProps = { id: string; children: (s: SortableRender) => React.ReactNode };

type Kit = typeof import("./dnd-kit");
const KitContext = createContext<Kit | null>(null);

const noop = () => {};
const STATIC: SortableRender = { setNodeRef: noop, setActivatorNodeRef: noop, handleProps: {}, isDragging: false };

export function DndRoot({ children, ...props }: DndRootProps) {
  const [kit, setKit] = useState<Kit | null>(null);
  const load = useCallback(() => {
    if (!kit) void import("./dnd-kit").then(setKit);
  }, [kit]);

  useEffect(() => {
    if (kit) return;
    const idle = window.requestIdleCallback?.(load, { timeout: 2000 });
    const timer = idle === undefined ? window.setTimeout(load, 1000) : undefined;
    return () => {
      if (idle !== undefined) window.cancelIdleCallback(idle);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [kit, load]);

  return (
    <div onPointerEnter={load} onFocusCapture={load}>
      <KitContext.Provider value={kit}>{kit ? <kit.DndRoot {...props}>{children}</kit.DndRoot> : children}</KitContext.Provider>
    </div>
  );
}

export function SortableList({ ids, children }: SortableListProps) {
  const kit = useContext(KitContext);
  return kit ? <kit.SortableList ids={ids}>{children}</kit.SortableList> : <>{children}</>;
}

export function SortableItem({ id, children }: SortableItemProps) {
  const kit = useContext(KitContext);
  return kit ? <kit.SortableItem id={id}>{children}</kit.SortableItem> : <>{children(STATIC)}</>;
}
