"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ExplorerData } from "@/components/explorer/explorer";
import type { SearchHit } from "@/db/queries/search";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import { de } from "@/lib/i18n/de";
import { useShell } from "./shell-context";

type Item = { id: string; group: "actions" | "projects" | "tickets"; label: string; hint?: string; color?: string; run: () => void };

const fold = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

/** Cmd/Ctrl+K: search tickets, jump to projects, run actions (KONZEPT §2.7). */
export function CommandPalette({
  open,
  onClose,
  explorer,
  onToggleSidebar,
  onShowHelp,
}: {
  open: boolean;
  onClose: () => void;
  explorer: ExplorerData;
  onToggleSidebar: () => void;
  onShowHelp: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={de.command.title} hideTitle className="top-[15vh] w-[min(36rem,calc(100vw-2rem))]">
      {open ? <PaletteBody explorer={explorer} onClose={onClose} onToggleSidebar={onToggleSidebar} onShowHelp={onShowHelp} /> : null}
    </Dialog>
  );
}

function PaletteBody({ explorer, onClose, onToggleSidebar, onShowHelp }: { explorer: ExplorerData; onClose: () => void; onToggleSidebar: () => void; onShowHelp: () => void }) {
  const { slug, workspaceId, canAdmin } = useShell();
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);

  const currentKey = pathname.match(/\/p\/([^/?]+)/)?.[1];

  // Debounced server search; stale responses are ignored.
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/w/${workspaceId}/search?q=${encodeURIComponent(query)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? (r.json() as Promise<SearchHit[]>) : []))
        .then(setHits)
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q, workspaceId]);

  const items = useMemo<Item[]>(() => {
    const go = (href: string) => {
      onClose();
      router.push(href);
    };
    const term = fold(q.trim());
    const matches = (s: string) => !term || fold(s).includes(term);
    const firstProject = explorer.projects.find((p) => p.key === currentKey) ?? explorer.projects[0];
    const actions: Item[] = [
      ...(firstProject
        ? [{ id: "a-new", group: "actions" as const, label: de.command.newTicket(firstProject.name), hint: "C", run: () => go(`/${slug}/p/${firstProject.key}?new=1`) }]
        : []),
      { id: "a-me", group: "actions", label: de.me.title, run: () => go(`/${slug}/me`) },
      { id: "a-home", group: "actions", label: de.shell.overview, run: () => go(`/${slug}`) },
      ...(currentKey
        ? [
            { id: "a-list", group: "actions" as const, label: de.command.toList, hint: "L", run: () => go(`/${slug}/p/${currentKey}`) },
            { id: "a-board", group: "actions" as const, label: de.command.toBoard, hint: "B", run: () => go(`/${slug}/p/${currentKey}?view=board`) },
            { id: "a-settings", group: "actions" as const, label: de.command.projectSettings, run: () => go(`/${slug}/p/${currentKey}/settings`) },
          ]
        : []),
      ...(canAdmin ? [{ id: "a-members", group: "actions" as const, label: de.members.title, run: () => go(`/${slug}/settings/members`) }] : []),
      { id: "a-sidebar", group: "actions", label: de.command.toggleSidebar, hint: "⌘B", run: () => { onClose(); onToggleSidebar(); } },
      { id: "a-help", group: "actions", label: de.command.shortcuts, hint: "?", run: () => { onClose(); onShowHelp(); } },
    ];
    const projects: Item[] = explorer.projects.map((p) => ({ id: `p-${p.id}`, group: "projects", label: p.name, hint: p.key, color: p.color, run: () => go(`/${slug}/p/${p.key}`) }));
    const tickets: Item[] = (q.trim().length >= 2 ? hits : []).map((h) => ({
      id: `t-${h.id}`,
      group: "tickets",
      label: h.title,
      hint: `${h.key} · ${h.statusName}`,
      color: h.projectColor,
      run: () => go(`/${slug}/p/${h.projectKey}?t=${h.key}`),
    }));
    return [...actions.filter((a) => matches(a.label)), ...projects.filter((p) => matches(p.label) || matches(p.hint ?? "")).slice(0, 6), ...tickets];
  }, [q, hits, explorer.projects, currentKey, slug, canAdmin, onClose, onShowHelp, onToggleSidebar, router]);

  const safeActive = Math.min(active, Math.max(0, items.length - 1));
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${safeActive}"]`)?.scrollIntoView({ block: "nearest" });
  }, [safeActive]);

  const groups: Array<{ key: Item["group"]; label: string }> = [
    { key: "actions", label: de.command.groups.actions },
    { key: "projects", label: de.command.groups.projects },
    { key: "tickets", label: de.command.groups.tickets },
  ];

  return (
    <div className="flex flex-col">
      <input
        autoFocus
        role="combobox"
        aria-expanded
        aria-controls={listId}
        aria-activedescendant={items[safeActive] ? `${listId}-${items[safeActive].id}` : undefined}
        aria-label={de.command.input}
        placeholder={de.command.placeholder}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          if (e.target.value.trim().length < 2) setHits([]);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (items.length) setActive((safeActive + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            items[safeActive]?.run();
          }
        }}
        className="h-11 border-b border-border bg-transparent px-1 text-[15px] placeholder:text-muted focus:outline-none"
      />
      <ul ref={listRef} id={listId} role="listbox" aria-label={de.command.results} className="max-h-[50vh] overflow-y-auto py-2">
        {items.length === 0 ? <li className="px-2 py-3 text-[13px] text-muted">{q.trim().length >= 2 ? de.command.noResults : de.command.typeToSearch}</li> : null}
        {groups.map((g) => {
          const groupItems = items.map((it, index) => ({ it, index })).filter(({ it }) => it.group === g.key);
          if (groupItems.length === 0) return null;
          return (
            <li key={g.key} role="presentation">
              <p className="px-2 pt-2 pb-1 text-xs font-medium text-muted" role="presentation">{g.label}</p>
              <ul role="group" aria-label={g.label}>
                {groupItems.map(({ it, index }) => (
                  <li
                    key={it.id}
                    id={`${listId}-${it.id}`}
                    data-index={index}
                    role="option"
                    aria-selected={index === safeActive}
                    onMouseMove={() => setActive(index)}
                    onClick={() => it.run()}
                    className={cn("flex cursor-pointer items-center gap-2 rounded-[var(--radius-badge)] px-2 py-1.5 text-[13px]", index === safeActive && "bg-bg")}
                  >
                    {it.color ? <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: it.color }} /> : null}
                    <span className="min-w-0 flex-1 truncate">{it.label}</span>
                    {it.hint ? <span className="shrink-0 font-mono text-[11px] text-muted">{it.hint}</span> : null}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const SHORTCUTS: Array<{ keys: string[]; label: keyof typeof de.help.items }> = [
  { keys: ["⌘/Strg", "K"], label: "palette" },
  { keys: ["/"], label: "search" },
  { keys: ["C"], label: "create" },
  { keys: ["L"], label: "list" },
  { keys: ["B"], label: "board" },
  { keys: ["⌘/Strg", "B"], label: "sidebar" },
  { keys: ["↑", "↓"], label: "navigate" },
  { keys: ["1–4"], label: "priority" },
  { keys: ["0"], label: "noPriority" },
  { keys: ["A"], label: "assign" },
  { keys: ["D"], label: "due" },
  { keys: ["Esc"], label: "close" },
  { keys: ["?"], label: "help" },
];

export function ShortcutHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={de.help.title}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
        {SHORTCUTS.map((s) => (
          <div key={s.label} className="contents">
            <dt className="flex gap-1">
              {s.keys.map((k) => (
                <kbd key={k} className="rounded border border-border bg-bg px-1.5 font-mono text-[11px]">{k}</kbd>
              ))}
            </dt>
            <dd>{de.help.items[s.label]}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
