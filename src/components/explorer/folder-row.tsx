"use client";

import { Dropdown } from "@/components/ui/dropdown";
import { ChevronDown, ChevronRight, Grip, More } from "@/components/ui/icons";
import { useShell } from "@/components/shell/shell-context";
import { cn } from "@/lib/cn";
import { de } from "@/lib/i18n/de";
import { SortableItem, SortableList } from "./dnd-bridge";
import { folderDndId, projectDndId, type FolderItem, type ProjectItem } from "./model";

type Props = {
  folder: FolderItem;
  projects: ProjectItem[];
  expanded: boolean;
  onToggle: (folderId: string) => void;
  onRename: (folder: FolderItem) => void;
  onDelete: (folder: FolderItem) => void;
  onNewProject: (folderId: string) => void;
  /** True while a project is dragged over this folder header. */
  dropTarget: boolean;
  children: React.ReactNode;
};

export function FolderRow({ folder, projects, expanded, onToggle, onRename, onDelete, onNewProject, dropTarget, children }: Props) {
  const { canAdmin } = useShell();
  const openCount = projects.reduce((n, p) => n + p.openCount, 0);
  const listId = `folder-${folder.id}`;

  return (
    <SortableItem id={folderDndId(folder.id)}>
      {(s) => (
    <li ref={s.setNodeRef} style={s.style} className={cn(s.isDragging && "relative z-10 opacity-60")}>
      <div className={cn("group flex h-8 items-center gap-1 rounded-[var(--radius-badge)] pr-1 pl-1 hover:bg-bg", dropTarget && "bg-accent/10 ring-1 ring-accent")}>
        <button
          ref={s.setActivatorNodeRef}
          type="button"
          aria-label={de.explorer.dragFolder(folder.name)}
          className="flex size-5 shrink-0 cursor-grab items-center justify-center rounded text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          {...s.handleProps}
        >
          <Grip size={14} />
        </button>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => onToggle(folder.id)}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-[13px] font-medium"
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="truncate">{folder.name}</span>
          {!expanded && openCount > 0 ? <span className="ml-auto text-xs font-normal text-muted tabular-nums">{openCount}</span> : null}
        </button>
        <Dropdown
          align="end"
          trigger={<More />}
          triggerLabel={de.explorer.folderMenu(folder.name)}
          triggerClassName="flex size-6 shrink-0 items-center justify-center rounded text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 hover:bg-border/60"
          items={[
            { label: de.explorer.newProjectHere, onSelect: () => onNewProject(folder.id) },
            { label: de.explorer.rename, onSelect: () => onRename(folder) },
            ...(canAdmin ? [{ label: de.explorer.deleteFolder, onSelect: () => onDelete(folder), danger: true }] : []),
          ]}
        />
      </div>
      {expanded ? (
        <SortableList ids={projects.map((p) => projectDndId(p.id))}>
          <ul id={listId} className="ml-4 border-l border-border pl-1">
            {projects.length === 0 ? <li className="px-2 py-1 text-xs text-muted">{de.explorer.emptyFolder}</li> : children}
          </ul>
        </SortableList>
      ) : null}
    </li>
      )}
    </SortableItem>
  );
}
