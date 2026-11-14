"use client";

import type { Announcements, DragEndEvent, DragOverEvent } from "@dnd-kit/core";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import { deleteFolderAction, moveFolderAction, moveProjectAction, savePrefsAction, setProjectArchivedAction } from "@/app/(app)/[workspace]/actions";
import { useShell } from "@/components/shell/shell-context";
import { Plus, Star } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { keyBetween } from "@/lib/fractional";
import { useT } from "@/lib/i18n/client";
import { onOpenCount } from "@/lib/explorer-events";
import { FolderNameDialog, NewProjectDialog } from "./dialogs";
import { DndRoot, SortableList } from "./dnd-bridge";
import { FolderRow } from "./folder-row";
import {
  applyProjectMove,
  computeFolderMove,
  computeProjectMove,
  folderDndId,
  parseDndId,
  projectDndId,
  projectsIn,
  sortByKey,
  type FolderItem,
  type ProjectItem,
} from "./model";
import { ProjectRow } from "./project-row";
import deExplorer from "@/lib/i18n/de/explorer";

const MESSAGES = { explorer: deExplorer };

export type ExplorerData = {
  folders: FolderItem[];
  projects: ProjectItem[];
  expandedFolders: string[];
  favorites: string[];
};

/** Keeps local (optimistic) state in sync when the server sends fresh data. */
function useSynced<T>(value: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState(value);
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    setState(value);
  }
  return [state, setState];
}

export function Explorer({ data }: { data: ExplorerData }) {
  const t = useT(MESSAGES);
  const { workspaceId, slug } = useShell();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  const [projects, setProjects] = useSynced(data.projects);
  const [folders, setFolders] = useSynced(data.folders);
  const [expanded, setExpanded] = useSynced(data.expandedFolders);
  const [favorites, setFavorites] = useSynced(data.favorites);
  // Counts change while someone works in a project view (no router.refresh, see explorer-events).
  useEffect(
    () => onOpenCount(({ projectId, openCount }) => setProjects((list) => list.map((p) => (p.id === projectId && p.openCount !== openCount ? { ...p, openCount } : p)))),
    [setProjects],
  );
  const [overFolder, setOverFolder] = useState<string | null>(null);
  // Stable id: dnd-kit otherwise numbers its aria ids differently on server and client.
  const dndId = useId();
  const [dialog, setDialog] = useState<
    { kind: "project"; folderId: string | null } | { kind: "folder" } | { kind: "rename"; folder: FolderItem } | null
  >(null);

  const sortedFolders = sortByKey(folders);
  const rootProjects = projectsIn(projects, null);
  const favoriteProjects = favorites.map((id) => projects.find((p) => p.id === id)).filter((p): p is ProjectItem => Boolean(p));

  function failed(rollback: () => void) {
    return (error?: string) => {
      rollback();
      toast({ message: error ?? t.explorer.saveFailed, tone: "error" });
    };
  }

  function persistPrefs(patch: { expandedFolders?: string[]; favorites?: string[] }) {
    startTransition(async () => {
      const r = await savePrefsAction({ workspaceId, ...patch });
      if (!r.ok) toast({ message: r.error, tone: "error" });
    });
  }

  function toggleFolder(folderId: string) {
    const next = expanded.includes(folderId) ? expanded.filter((f) => f !== folderId) : [...expanded, folderId];
    setExpanded(next);
    persistPrefs({ expandedFolders: next });
  }

  function toggleFavorite(projectId: string) {
    const next = favorites.includes(projectId) ? favorites.filter((f) => f !== projectId) : [...favorites, projectId];
    setFavorites(next);
    persistPrefs({ favorites: next });
  }

  function moveProject(move: { projectId: string; folderId: string | null; sort: string }) {
    const before = projects;
    setProjects(applyProjectMove(projects, move));
    if (move.folderId && !expanded.includes(move.folderId)) toggleFolder(move.folderId);
    startTransition(async () => {
      const r = await moveProjectAction({ workspaceId, ...move });
      if (!r.ok) failed(() => setProjects(before))(r.error);
    });
  }

  function moveTo(projectId: string, folderId: string | null) {
    const siblings = projectsIn(projects, folderId).map((p) => p.sort);
    moveProject({ projectId, folderId, sort: keyBetween(siblings.at(-1) ?? null, null) });
  }

  function archive(projectId: string) {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    const call = (archived: boolean) => {
      const fd = new FormData();
      fd.set("workspaceId", workspaceId);
      fd.set("projectId", projectId);
      fd.set("archived", String(archived));
      return setProjectArchivedAction(fd);
    };
    setProjects(projects.filter((p) => p.id !== projectId));
    const projectPath = `/${slug}/p/${project.key}`;
    if (pathname.startsWith(projectPath)) router.push(`/${slug}`);
    startTransition(async () => {
      await call(true);
      toast({
        message: t.explorer.archived(project.name),
        tone: "success",
        action: { label: t.explorer.undo, onClick: () => startTransition(() => call(false).then(() => router.refresh())) },
      });
    });
  }

  function deleteFolder(folder: FolderItem) {
    const before = { folders, projects };
    setFolders(folders.filter((f) => f.id !== folder.id));
    setProjects(projects.map((p) => (p.folderId === folder.id ? { ...p, folderId: null } : p)));
    startTransition(async () => {
      const r = await deleteFolderAction({ workspaceId, folderId: folder.id });
      if (!r.ok) {
        failed(() => {
          setFolders(before.folders);
          setProjects(before.projects);
        })(r.error);
      } else toast({ message: t.explorer.folderDeleted(folder.name), tone: "success" });
    });
  }

  function onDragOver(e: DragOverEvent) {
    const active = parseDndId(String(e.active.id));
    const over = e.over ? parseDndId(String(e.over.id)) : null;
    setOverFolder(active?.kind === "project" && over?.kind === "folder" ? over.id : null);
  }

  function onDragEnd(e: DragEndEvent) {
    setOverFolder(null);
    if (!e.over) return;
    const active = parseDndId(String(e.active.id));
    const over = parseDndId(String(e.over.id));
    if (!active || !over) return;

    if (active.kind === "project") {
      const move = computeProjectMove(projects, active.id, String(e.over.id));
      if (move) moveProject(move);
      return;
    }
    if (over.kind !== "folder") return;
    const move = computeFolderMove(folders, active.id, over.id);
    if (!move) return;
    const before = folders;
    setFolders(folders.map((f) => (f.id === move.folderId ? { ...f, sort: move.sort } : f)));
    startTransition(async () => {
      const r = await moveFolderAction({ workspaceId, ...move });
      if (!r.ok) failed(() => setFolders(before))(r.error);
    });
  }

  const nameOf = (dndId: string | number) => {
    const ref = parseDndId(String(dndId));
    if (!ref) return "";
    return ref.kind === "project" ? (projects.find((p) => p.id === ref.id)?.name ?? "") : (folders.find((f) => f.id === ref.id)?.name ?? "");
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => t.explorer.dnd.start(nameOf(active.id)),
    onDragOver: ({ active, over }) => (over ? t.explorer.dnd.over(nameOf(active.id), nameOf(over.id)) : t.explorer.dnd.outside(nameOf(active.id))),
    onDragEnd: ({ active, over }) => (over ? t.explorer.dnd.end(nameOf(active.id), nameOf(over.id)) : t.explorer.dnd.cancel(nameOf(active.id))),
    onDragCancel: ({ active }) => t.explorer.dnd.cancel(nameOf(active.id)),
  };

  const rowProps = { folders: sortedFolders, onToggleFavorite: toggleFavorite, onMoveTo: moveTo, onArchive: archive };

  return (
    <div className="flex flex-col gap-4">
      {favoriteProjects.length > 0 ? (
        <section aria-labelledby="fav-heading">
          <h2 id="fav-heading" className="mb-1 flex items-center gap-1.5 px-2 text-[11px] font-semibold tracking-wide text-muted uppercase">
            <Star size={12} filled /> {t.explorer.favorites}
          </h2>
          <ul>
            {favoriteProjects.map((p) => (
              <ProjectRow key={p.id} project={p} favorite sortable={false} {...rowProps} />
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="projects-heading">
        <div className="mb-1 flex items-center justify-between px-2">
          <h2 id="projects-heading" className="text-[11px] font-semibold tracking-wide text-muted uppercase">
            {t.explorer.projects}
          </h2>
        </div>
        <DndRoot
          id={dndId}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => setOverFolder(null)}
          announcements={announcements}
          instructions={t.explorer.dnd.instructions}
        >
          <SortableList ids={sortedFolders.map((f) => folderDndId(f.id))}>
            <ul>
              {sortedFolders.map((f) => {
                const inside = projectsIn(projects, f.id);
                return (
                  <FolderRow
                    key={f.id}
                    folder={f}
                    projects={inside}
                    expanded={expanded.includes(f.id)}
                    onToggle={toggleFolder}
                    onRename={(folder) => setDialog({ kind: "rename", folder })}
                    onDelete={deleteFolder}
                    onNewProject={(folderId) => setDialog({ kind: "project", folderId })}
                    dropTarget={overFolder === f.id}
                  >
                    {inside.map((p) => (
                      <ProjectRow key={p.id} project={p} favorite={favorites.includes(p.id)} {...rowProps} />
                    ))}
                  </FolderRow>
                );
              })}
            </ul>
          </SortableList>
          <SortableList ids={rootProjects.map((p) => projectDndId(p.id))}>
            <ul>
              {rootProjects.map((p) => (
                <ProjectRow key={p.id} project={p} favorite={favorites.includes(p.id)} {...rowProps} />
              ))}
            </ul>
          </SortableList>
        </DndRoot>

        {projects.length === 0 ? <p className="px-2 py-1 text-[13px] text-muted">{t.explorer.noProjects}</p> : null}

        <div className="mt-1 flex flex-col">
          <button
            type="button"
            onClick={() => setDialog({ kind: "project", folderId: null })}
            className="flex h-8 items-center gap-2 rounded-[var(--radius-badge)] px-2 text-sm text-secondary hover:bg-hover hover:text-text"
          >
            <Plus size={14} /> {t.explorer.newProject}
          </button>
          <button
            type="button"
            onClick={() => setDialog({ kind: "folder" })}
            className="flex h-8 items-center gap-2 rounded-[var(--radius-badge)] px-2 text-sm text-secondary hover:bg-hover hover:text-text"
          >
            <Plus size={14} /> {t.explorer.newFolder}
          </button>
        </div>
      </section>

      <NewProjectDialog
        open={dialog?.kind === "project"}
        folderId={dialog?.kind === "project" ? dialog.folderId : null}
        folders={sortedFolders}
        onClose={() => setDialog(null)}
      />
      <FolderNameDialog
        open={dialog?.kind === "folder" || dialog?.kind === "rename"}
        folder={dialog?.kind === "rename" ? dialog.folder : null}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
