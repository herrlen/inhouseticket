import { compareKeys, keyForIndex } from "@/lib/fractional";

// Pure explorer logic (unit-tested): which container a drop lands in and the new sort key.

export type FolderItem = { id: string; name: string; sort: string };
export type ProjectItem = {
  id: string;
  name: string;
  key: string;
  color: string;
  icon: string | null;
  folderId: string | null;
  sort: string;
  openCount: number;
};

export const ROOT = "root";
export const projectDndId = (id: string) => `p:${id}`;
export const folderDndId = (id: string) => `f:${id}`;

export function parseDndId(dndId: string): { kind: "project" | "folder"; id: string } | null {
  const [prefix, id] = [dndId.slice(0, 2), dndId.slice(2)];
  if (prefix === "p:") return { kind: "project", id };
  if (prefix === "f:") return { kind: "folder", id };
  return null;
}

export function sortByKey<T extends { sort: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => compareKeys(a.sort, b.sort));
}

export function projectsIn(projects: readonly ProjectItem[], folderId: string | null): ProjectItem[] {
  return sortByKey(projects.filter((p) => p.folderId === folderId));
}

export type ProjectMove = { projectId: string; folderId: string | null; sort: string };

/**
 * Where does project `activeId` go when dropped on `overDndId`?
 * - on another project: its container, at that project's position
 * - on a folder: end of that folder
 */
export function computeProjectMove(projects: readonly ProjectItem[], activeId: string, overDndId: string): ProjectMove | null {
  const active = projects.find((p) => p.id === activeId);
  const over = parseDndId(overDndId);
  if (!active || !over) return null;

  if (over.kind === "folder") {
    if (active.folderId === over.id) return null;
    const siblings = projectsIn(projects, over.id).map((p) => p.sort);
    return { projectId: activeId, folderId: over.id, sort: keyForIndex(siblings, siblings.length) };
  }

  if (over.id === activeId) return null;
  const target = projects.find((p) => p.id === over.id);
  if (!target) return null;
  const container = projectsIn(projects, target.folderId);
  const others = container.filter((p) => p.id !== activeId);
  const overIndex = others.findIndex((p) => p.id === target.id);

  let index = overIndex;
  if (active.folderId === target.folderId) {
    // Same list: moving down lands after the target, moving up before it (dnd-kit semantics).
    const from = container.findIndex((p) => p.id === activeId);
    const to = container.findIndex((p) => p.id === target.id);
    index = from < to ? overIndex + 1 : overIndex;
  }
  return { projectId: activeId, folderId: target.folderId, sort: keyForIndex(others.map((p) => p.sort), index) };
}

export function computeFolderMove(folders: readonly FolderItem[], activeId: string, overId: string): { folderId: string; sort: string } | null {
  if (activeId === overId) return null;
  const sorted = sortByKey(folders);
  const from = sorted.findIndex((f) => f.id === activeId);
  const to = sorted.findIndex((f) => f.id === overId);
  if (from < 0 || to < 0) return null;
  const others = sorted.filter((f) => f.id !== activeId);
  const overIndex = others.findIndex((f) => f.id === overId);
  const index = from < to ? overIndex + 1 : overIndex;
  return { folderId: activeId, sort: keyForIndex(others.map((f) => f.sort), index) };
}

export function applyProjectMove(projects: readonly ProjectItem[], move: ProjectMove): ProjectItem[] {
  return projects.map((p) => (p.id === move.projectId ? { ...p, folderId: move.folderId, sort: move.sort } : p));
}
