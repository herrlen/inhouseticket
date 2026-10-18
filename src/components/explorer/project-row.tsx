"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Dropdown, type DropdownItem } from "@/components/ui/dropdown";
import { Grip, More } from "@/components/ui/icons";
import { projectHref, useShell } from "@/components/shell/shell-context";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/client";
import { SortableItem } from "./dnd-bridge";
import { projectDndId, type FolderItem, type ProjectItem } from "./model";

type Props = {
  project: ProjectItem;
  folders: FolderItem[];
  favorite: boolean;
  onToggleFavorite: (projectId: string) => void;
  onMoveTo: (projectId: string, folderId: string | null) => void;
  onArchive: (projectId: string) => void;
  /** Favorites list: not draggable. */
  sortable?: boolean;
};

export function ProjectRow(props: Props) {
  if (props.sortable === false) return <ProjectRowView {...props} />;
  return <SortableProjectRow {...props} />;
}

function SortableProjectRow(props: Props) {
  const t = useT();
  return (
    <SortableItem id={projectDndId(props.project.id)}>
      {(s) => (
        <li ref={s.setNodeRef} style={s.style} className={cn(s.isDragging && "relative z-10 opacity-60")}>
          <ProjectRowView
            {...props}
            handle={
              <button
                ref={s.setActivatorNodeRef}
                type="button"
                aria-label={t.explorer.dragProject(props.project.name)}
                className="flex size-5 shrink-0 cursor-grab items-center justify-center rounded text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
                {...s.handleProps}
              >
                <Grip size={14} />
              </button>
            }
          />
        </li>
      )}
    </SortableItem>
  );
}

function ProjectRowView({ project, folders, favorite, onToggleFavorite, onMoveTo, onArchive, handle }: Props & { handle?: React.ReactNode }) {
  const t = useT();
  const shell = useShell();
  const { slug, canAdmin } = shell;
  const router = useRouter();
  const href = `/${slug}/p/${project.key}`;
  const active = usePathname().startsWith(href);

  const items: DropdownItem[] = [
    { label: favorite ? t.explorer.unfavorite : t.explorer.favorite, onSelect: () => onToggleFavorite(project.id) },
    { label: t.explorer.settings, onSelect: () => router.push(`${href}/settings`) },
    ...folders
      .filter((f) => f.id !== project.folderId)
      .map((f) => ({ label: t.explorer.moveTo(f.name), onSelect: () => onMoveTo(project.id, f.id) })),
    ...(project.folderId ? [{ label: t.explorer.moveToRoot, onSelect: () => onMoveTo(project.id, null) }] : []),
    ...(canAdmin ? [{ label: t.explorer.archive, onSelect: () => onArchive(project.id), danger: true }] : []),
  ];

  const row = (
    <div className={cn("group flex h-8 items-center gap-1 rounded-[var(--radius-badge)] pr-1 pl-1", active ? "bg-bg" : "hover:bg-bg")}>
      {handle ?? <span className="w-5 shrink-0" />}
      <Link href={projectHref(shell, project.key)} aria-current={active ? "page" : undefined} className="flex min-w-0 flex-1 items-center gap-2 py-1 text-[13px]">
        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
        {project.icon ? <span aria-hidden>{project.icon}</span> : null}
        <span className="truncate">{project.name}</span>
        {project.openCount > 0 ? (
          <span className="ml-auto text-xs text-muted tabular-nums" aria-label={t.explorer.openCount(project.openCount)}>
            {project.openCount}
          </span>
        ) : null}
      </Link>
      <Dropdown
        align="end"
        trigger={<More />}
        triggerLabel={t.explorer.projectMenu(project.name)}
        triggerClassName="flex size-6 shrink-0 items-center justify-center rounded text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 hover:bg-border/60"
        items={items}
      />
    </div>
  );
  return handle ? row : <li>{row}</li>;
}
