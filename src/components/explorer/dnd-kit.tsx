"use client";

import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { DndRootProps, SortableItemProps, SortableListProps } from "./dnd-bridge";

// The drag & drop layer of the sidebar. Loaded on demand by dnd-bridge.tsx so dnd-kit (~10 KB gz)
// is not part of every page's initial JavaScript.

export function DndRoot({ id, onDragOver, onDragEnd, onDragCancel, announcements, instructions, children }: Omit<DndRootProps, "children"> & { children: React.ReactNode }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
      accessibility={{ announcements, screenReaderInstructions: { draggable: instructions } }}
    >
      {children}
    </DndContext>
  );
}

export function SortableList({ ids, children }: SortableListProps) {
  return (
    <SortableContext items={ids} strategy={verticalListSortingStrategy}>
      {children}
    </SortableContext>
  );
}

export function SortableItem({ id, children }: SortableItemProps) {
  const s = useSortable({ id });
  return children({
    setNodeRef: s.setNodeRef,
    setActivatorNodeRef: s.setActivatorNodeRef,
    style: { transform: CSS.Translate.toString(s.transform), transition: s.transition },
    handleProps: { ...s.attributes, ...s.listeners },
    isDragging: s.isDragging,
  });
}
