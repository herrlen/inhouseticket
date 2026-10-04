"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { savePrefsAction } from "@/app/(app)/[workspace]/actions";
import { signOut } from "@/app/actions/sign-out";
import { Explorer, type ExplorerData } from "@/components/explorer/explorer";
import { Avatar } from "@/components/ui/avatar";
import { Dialog } from "@/components/ui/dialog";
import { Dropdown } from "@/components/ui/dropdown";
import { Home, Menu, Sidebar as SidebarIcon, Users } from "@/components/ui/icons";
import { ToastProvider } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { de } from "@/lib/i18n/de";
import { PrefsProvider } from "./prefs-context";
import { QueryProvider } from "./query-provider";
import { ShellProvider, useShell, type ShellInfo } from "./shell-context";

type Props = {
  shell: ShellInfo;
  user: { id: string; name: string; email: string; image?: string | null };
  explorer: ExplorerData;
  initialCollapsed: boolean;
  initialConfetti: boolean;
  children: ReactNode;
};

const noopSubscribe = () => () => {};
/** "⌘B" on Apple devices, "Strg+B" elsewhere – resolved after hydration. */
function useShortcutLabel() {
  return useSyncExternalStore(
    noopSubscribe,
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘B" : "Strg+B"),
    () => "Strg+B",
  );
}

export function AppShell({ shell, user, explorer, initialCollapsed, initialConfetti, children }: Props) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [, startTransition] = useTransition();
  const [confetti, setConfettiState] = useState(initialConfetti);
  const setConfetti = useCallback(
    (on: boolean) => {
      setConfettiState(on);
      startTransition(() => void savePrefsAction({ workspaceId: shell.workspaceId, confetti: on }));
    },
    [shell.workspaceId],
  );
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();

  // Close the mobile drawer after navigating.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setDrawer(false);
  }

  // Persist the collapsed state when it changes – compared with the last saved value, so mounting
  // (and React's dev double-invocation) never triggers a write.
  const savedCollapsed = useRef(initialCollapsed);
  useEffect(() => {
    if (collapsed === savedCollapsed.current) return;
    savedCollapsed.current = collapsed;
    startTransition(() => void savePrefsAction({ workspaceId: shell.workspaceId, sidebarCollapsed: collapsed }));
  }, [collapsed, shell.workspaceId]);

  const toggle = useCallback(() => setCollapsed((c) => !c), []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  return (
    <ShellProvider value={shell}>
      <QueryProvider>
      <PrefsProvider value={{ confetti, setConfetti }}>
      <ToastProvider>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-surface focus:p-2">
          {de.common.skipToContent}
        </a>
        <div className="flex h-dvh">
          <aside
            aria-label={de.shell.sidebar}
            data-collapsed={collapsed}
            className={cn(
              "hidden shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-micro ease-out-quick md:flex",
              collapsed ? "w-14" : "w-60",
            )}
          >
            <SidebarContent collapsed={collapsed} explorer={explorer} onToggle={toggle} />
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar user={user} explorer={explorer} onOpenDrawer={() => setDrawer(true)} confetti={confetti} onToggleConfetti={() => setConfetti(!confetti)} />
            <main id="main" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto">
              {children}
            </main>
          </div>
        </div>

        <Dialog open={drawer} onClose={() => setDrawer(false)} title={de.shell.sidebar} hideTitle placement="left" className="md:hidden">
          <SidebarContent collapsed={false} explorer={explorer} />
        </Dialog>
      </ToastProvider>
      </PrefsProvider>
      </QueryProvider>
    </ShellProvider>
  );
}

function SidebarContent({ collapsed, explorer, onToggle }: { collapsed: boolean; explorer: ExplorerData; onToggle?: () => void }) {
  const shell = useShell();
  const pathname = usePathname();
  const home = `/${shell.slug}`;
  const members = `${home}/settings/members`;
  const shortcut = useShortcutLabel();

  const nav = [
    { href: home, label: de.shell.overview, icon: <Home />, active: pathname === home },
    ...(shell.canAdmin ? [{ href: members, label: de.members.title, icon: <Users />, active: pathname.startsWith(members) }] : []),
  ];

  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-12 shrink-0 items-center gap-2 border-b border-border", collapsed ? "justify-center" : "px-4")}>
        <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ backgroundColor: shell.workspaceColor }} />
        {!collapsed ? <span className="truncate font-semibold">{shell.workspaceName}</span> : <span className="sr-only">{shell.workspaceName}</span>}
      </div>

      <nav aria-label={de.common.mainNav} className="flex flex-col gap-0.5 p-2">
        {nav.map((item) =>
          collapsed ? (
            <Tooltip key={item.href} content={item.label} side="bottom">
              <Link
                href={item.href}
                aria-label={item.label}
                aria-current={item.active ? "page" : undefined}
                className={cn("flex size-10 items-center justify-center rounded-[var(--radius-badge)] text-muted hover:bg-bg hover:text-text", item.active && "bg-bg text-text")}
              >
                {item.icon}
              </Link>
            </Tooltip>
          ) : (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={cn("flex h-8 items-center gap-2 rounded-[var(--radius-badge)] px-2 text-[13px] hover:bg-bg", item.active && "bg-bg font-medium")}
            >
              <span className="text-muted">{item.icon}</span>
              {item.label}
            </Link>
          ),
        )}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-border p-2">
        {collapsed ? <CollapsedProjects explorer={explorer} /> : <Explorer data={explorer} />}
      </div>

      {onToggle ? (
        <div className={cn("border-t border-border p-2", collapsed && "flex justify-center")}>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!collapsed}
            aria-keyshortcuts="Meta+B Control+B"
            aria-label={collapsed ? de.shell.expand : de.shell.collapse}
            className={cn("flex items-center gap-2 rounded-[var(--radius-badge)] text-[13px] text-muted hover:bg-bg hover:text-text", collapsed ? "size-10 justify-center" : "h-8 w-full px-2")}
          >
            <SidebarIcon />
            {!collapsed ? (
              <>
                {de.shell.collapse}
                <kbd className="ml-auto font-mono text-xs">{shortcut}</kbd>
              </>
            ) : null}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function CollapsedProjects({ explorer }: { explorer: ExplorerData }) {
  const { slug } = useShell();
  const pathname = usePathname();
  const ordered = [
    ...explorer.favorites.map((id) => explorer.projects.find((p) => p.id === id)).filter(Boolean),
    ...explorer.projects.filter((p) => !explorer.favorites.includes(p.id)),
  ] as ExplorerData["projects"];
  return (
    <ul className="flex flex-col items-center gap-1">
      {ordered.map((p) => {
        const href = `/${slug}/p/${p.key}`;
        return (
          <li key={p.id}>
            <Tooltip content={p.name} side="bottom">
              <Link
                href={href}
                aria-label={p.name}
                aria-current={pathname.startsWith(href) ? "page" : undefined}
                className={cn("flex size-10 items-center justify-center rounded-[var(--radius-badge)] hover:bg-bg", pathname.startsWith(href) && "bg-bg")}
              >
                {p.icon ? <span aria-hidden>{p.icon}</span> : <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: p.color }} />}
              </Link>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}

function Topbar({
  user,
  explorer,
  onOpenDrawer,
  confetti,
  onToggleConfetti,
}: {
  user: Props["user"];
  explorer: ExplorerData;
  onOpenDrawer: () => void;
  confetti: boolean;
  onToggleConfetti: () => void;
}) {
  const shell = useShell();
  const router = useRouter();
  const crumbs = useBreadcrumb(explorer);

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 md:px-4">
      <button
        type="button"
        onClick={onOpenDrawer}
        aria-label={de.shell.openMenu}
        className="flex size-8 items-center justify-center rounded-[var(--radius-badge)] text-muted hover:bg-bg md:hidden"
      >
        <Menu />
      </button>
      <nav aria-label={de.shell.breadcrumb} className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-1.5 text-[13px]">
          {crumbs.map((c, i) => (
            <li key={`${i}-${c.label}`} className="flex min-w-0 items-center gap-1.5">
              {i > 0 ? <span aria-hidden className="text-muted">/</span> : null}
              {c.href && i < crumbs.length - 1 ? (
                <Link href={c.href} className="truncate text-muted hover:text-text">
                  {c.label}
                </Link>
              ) : (
                <span aria-current={i === crumbs.length - 1 ? "page" : undefined} className={cn("truncate", i === crumbs.length - 1 ? "font-medium" : "text-muted")}>
                  {c.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <Dropdown
        align="end"
        trigger={<Avatar user={user} size="sm" />}
        triggerLabel={de.shell.userMenu(user.name)}
        triggerClassName="flex size-8 items-center justify-center rounded-full hover:ring-2 hover:ring-border"
        items={[
          ...(shell.canAdmin ? [{ label: de.members.title, onSelect: () => router.push(`/${shell.slug}/settings/members`) }] : []),
          { label: de.shell.switchWorkspace, onSelect: () => router.push("/start") },
          { label: confetti ? de.shell.confettiOff : de.shell.confettiOn, onSelect: onToggleConfetti },
          { label: de.common.signOut, onSelect: () => void signOut() },
          { label: "Impressum", onSelect: () => router.push("/impressum") },
          { label: "Datenschutz", onSelect: () => router.push("/datenschutz") },
        ]}
      />
    </header>
  );
}

type Crumb = { label: string; href?: string };

function useBreadcrumb(explorer: ExplorerData): Crumb[] {
  const shell = useShell();
  const pathname = usePathname();
  const base = `/${shell.slug}`;
  const crumbs: Crumb[] = [{ label: shell.workspaceName, href: base }];
  const rest = pathname.slice(base.length).split("/").filter(Boolean);

  if (rest[0] === "p" && rest[1]) {
    const project = explorer.projects.find((p) => p.key === decodeURIComponent(rest[1]!));
    const folder = project?.folderId ? explorer.folders.find((f) => f.id === project.folderId) : undefined;
    if (folder) crumbs.push({ label: folder.name });
    crumbs.push({ label: project?.name ?? rest[1]!, href: `${base}/p/${rest[1]}` });
    if (rest[2] === "settings") crumbs.push({ label: de.explorer.settings });
  } else if (rest[0] === "settings" && rest[1] === "members") {
    crumbs.push({ label: de.members.title });
  } else if (rest.length === 0) {
    crumbs.push({ label: de.shell.overview });
  }
  return crumbs;
}
