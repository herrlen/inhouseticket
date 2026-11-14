"use client";

import { useIsMutating } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { LabelRow, MemberOption, TicketRow } from "@/db/queries/tickets";
import type { SavedViewRow } from "@/db/queries/views";
import { trackEvent } from "@/lib/analytics";
import { announceOpenCount } from "@/lib/explorer-events";
import { cleanViewQuery } from "@/lib/view-query";
import { FilterBar } from "./filter-bar";
import { applyFilters, hasFilters, readFilters } from "./filters";
import { Button } from "@/components/ui/button";
import { Filter as FilterIcon, KanbanIcon, ListIcon, Person, Plus, Settings } from "@/components/ui/icons";
import { SlideOver } from "@/components/ui/dialog";
import { useT } from "@/lib/i18n/client";
import { usePrefs } from "@/components/shell/prefs-context";
import { useShell } from "@/components/shell/shell-context";
import { ListOptions } from "./list-extras";
import { confettiBurst } from "@/lib/confetti";
import { cn } from "@/lib/cn";
import { BulkBar } from "./bulk-bar";
import { ProjectInfoProvider, type ProjectInfo } from "./context";
import { groupTickets, todayInBerlin, type GroupBy, type SortBy, type StatusOption } from "./list-model";
import { QuickAdd } from "./quick-add";
import { TicketList } from "./ticket-list";
import { useBulkUpdate, useCreateTicket, useTickets, useUpdateTicket } from "./use-tickets";
import deDetail from "@/lib/i18n/de/detail";
import deExplorer from "@/lib/i18n/de/explorer";
import deFilters from "@/lib/i18n/de/filters";
import deList from "@/lib/i18n/de/list";
import dePriority from "@/lib/i18n/de/priority";
import deView from "@/lib/i18n/de/view";
import deHierarchy from "@/lib/i18n/de/hierarchy";
import type { TicketType } from "@/lib/ticket-hierarchy";

const MESSAGES = { detail: deDetail, explorer: deExplorer, filters: deFilters, hierarchy: deHierarchy, list: deList, priority: dePriority, view: deView };

/** Types offered for new top-level tickets (a subtask is created from its story or task). */
const NEW_TYPES = ["task", "story", "epic"] as const satisfies readonly TicketType[];

// Loaded on demand to keep the list view within the JS budget (≤ 200 KB gzip): the board pulls in
// dnd-kit, the detail panel Markdown, uploads and comments.
const Board = dynamic(() => import("./board").then((m) => m.Board), {
  loading: () => <div className="h-[60vh] animate-pulse rounded-xl bg-sidebar" aria-hidden />,
});
const TicketDetail = dynamic(() => import("./ticket-detail").then((m) => m.TicketDetail), {
  loading: () => <div className="h-96 animate-pulse rounded-[var(--radius-field)] bg-hover" aria-hidden />,
});

// Client only: a server-rendered button would ignore clicks until its chunk has loaded.
const NewStatusRow = dynamic(() => import("./list-lazy").then((m) => m.NewStatusRow), { ssr: false });

const GROUPS: GroupBy[] = ["status", "priority", "assignee", "due", "none"];
const SORTS: SortBy[] = ["manual", "priority", "due", "created", "number"];

type Props = {
  info: Omit<ProjectInfo, "labels" | "statuses" | "members">;
  statuses: StatusOption[];
  members: MemberOption[];
  labels: LabelRow[];
  initialTickets: TicketRow[];
  savedViews: SavedViewRow[];
};

// Query string as live state. Since Next 16.4, useSearchParams follows history.pushState/
// replaceState only through an asynchronous history restore: an opened ticket stayed on the old
// one, ↑ after ↓ started from a stale ticket, and a router.refresh() racing the change wrote the
// older URL back (the dialog flipped tickets and lost what was typed – hence no router.refresh in
// the project view, see explorer-events). So the view reads the address bar itself: setParams
// notifies, back/forward arrive as popstate. During hydration the snapshot is Next's value in
// the same normalised form, so server and client agree and nothing re-renders early.
const paramListeners = new Set<() => void>();
function subscribeParams(listener: () => void) {
  paramListeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    paramListeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}
const addressBarQuery = () => new URLSearchParams(window.location.search).toString();
function useLiveSearchParams(): URLSearchParams {
  const fromNext = useSearchParams().toString();
  const query = useSyncExternalStore(subscribeParams, addressBarQuery, () => fromNext);
  // Router navigations (command palette, links) render before Next writes the address bar:
  // read it again once that commit is done.
  useEffect(() => {
    for (const listener of paramListeners) listener();
  }, [fromNext]);
  return useMemo(() => new URLSearchParams(query), [query]);
}

/** Updates the query string without a server round trip. */
function setParams(patch: Record<string, string | null>, mode: "push" | "replace" = "replace") {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  window.history[mode === "push" ? "pushState" : "replaceState"](null, "", url);
  for (const listener of paramListeners) listener();
}

/** List/board switch by the person (button or L/B) – reported to Matomo only when it changes. */
function switchView(next: "list" | "board") {
  const current = new URL(window.location.href).searchParams.get("view") === "board" ? "board" : "list";
  if (current === next) return;
  setParams({ view: next === "board" ? "board" : null });
  trackEvent("View", next === "board" ? "Kanban" : "List");
}

const isEditable = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || Boolean(el.closest("[role=menu],dialog")));

export function ProjectView({ info, statuses, members, labels: initialLabels, initialTickets, savedViews }: Props) {
  const t = useT(MESSAGES);
  const params = useLiveSearchParams();
  const groupBy = (GROUPS.find((g) => g === params.get("group")) ?? "status") as GroupBy;
  const sortBy = (SORTS.find((s) => s === params.get("sort")) ?? "manual") as SortBy;
  const openKey = params.get("t");
  const view = params.get("view") === "board" ? "board" : "list";
  // List additions (docs/ONBOARDING.md §4): done tickets hidden unless switched on, subtasks unfolded on demand.
  const showDone = params.get("done") === "1";
  const showSubtasks = params.get("subtasks") === "1";
  const { confetti, hiddenColumns, setHiddenColumns } = usePrefs();
  const { canAdmin } = useShell();

  const [labels, setLabels] = useState(initialLabels);
  const [views, setViews] = useState(savedViews);
  const filters = useMemo(() => readFilters(params), [params]);
  const currentQuery = cleanViewQuery(params);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newType, setNewType] = useState<(typeof NEW_TYPES)[number]>("task");
  const quickAdd = useRef<HTMLInputElement>(null);

  const { workspaceId, project } = info;
  const { data: tickets } = useTickets(workspaceId, project.id, initialTickets);
  const categoryOf = useCallback((id: string) => statuses.find((s) => s.id === id)?.category, [statuses]);
  const update = useUpdateTicket(workspaceId, project.id, categoryOf);
  const create = useCreateTicket(workspaceId, project.id);
  const bulk = useBulkUpdate(workspaceId, project.id, categoryOf);

  const today = todayInBerlin();

  // Unsaved edits: show it, and ask before leaving the page while requests are in flight.
  const saving = useIsMutating() > 0;
  useEffect(() => {
    if (!saving) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saving]);
  const doneStatusIds = useMemo(() => new Set(statuses.filter((s) => s.category === "done").map((s) => s.id)), [statuses]);
  // Sidebar count, same rule as the server (status not done) – replaces router.refresh().
  const openCount = tickets.filter((x) => !doneStatusIds.has(x.statusId)).length;
  useEffect(() => announceOpenCount({ projectId: project.id, openCount }), [project.id, openCount]);
  const filtered = useMemo(
    () => applyFilters(tickets, filters, { currentUserId: info.currentUserId, today, doneStatusIds, projectKey: project.key }),
    [tickets, filters, info.currentUserId, today, doneStatusIds, project.key],
  );
  const listed = useMemo(() => (showDone ? filtered : filtered.filter((x) => !doneStatusIds.has(x.statusId))), [filtered, showDone, doneStatusIds]);
  const hiddenDone = filtered.length - listed.length;
  const groups = useMemo(() => groupTickets(listed, { groupBy, sortBy, statuses, members, today, t }), [listed, groupBy, sortBy, statuses, members, today, t]);
  const visibleOrder = groups.flatMap((g) => g.tickets).filter((t) => !t.id.startsWith("temp-"));
  const openTicket = openKey ? tickets.find((t) => `${project.key}-${t.number}` === openKey) ?? null : null;

  // "Neues Ticket" from the command palette arrives as ?new=1.
  const wantsNew = params.get("new") === "1";
  useEffect(() => {
    if (!wantsNew) return;
    setParams({ new: null });
    quickAdd.current?.focus();
  }, [wantsNew]);

  // "C" focuses the quick add (KONZEPT §2.7) – not while typing or inside menus/dialogs.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isEditable(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === "c") {
        e.preventDefault();
        quickAdd.current?.focus();
      } else if (key === "l" || key === "b") {
        e.preventDefault();
        switchView(key === "b" ? "board" : "list");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const open = (ticketId: string) => {
    const t = tickets.find((x) => x.id === ticketId);
    if (t) setParams({ t: `${project.key}-${t.number}` }, openKey ? "replace" : "push");
  };
  // Return focus to where the ticket was opened from (list row or board card) – once the dialog
  // is really gone; focusing right after setParams would land inside the still-open modal.
  const returnFocusTo = useRef<string | null>(null);
  useEffect(() => {
    const id = returnFocusTo.current;
    if (openKey || !id) return;
    returnFocusTo.current = null;
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(`[data-ticket-row="${id}"] button, [data-card="${id}"]`)?.focus(),
    );
  }, [openKey]);
  const close = () => {
    returnFocusTo.current = openTicket?.id ?? null;
    setParams({ t: null });
  };
  const navigate = (direction: 1 | -1) => {
    if (!openTicket) return;
    const i = visibleOrder.findIndex((t) => t.id === openTicket.id);
    const next = visibleOrder[i + direction];
    if (next) open(next.id);
  };

  const providerValue: ProjectInfo = { ...info, statuses, members, labels };
  const mine = filters.assignee === "me";
  // The panel starts open while filters (other than "Nur meine") or saved views exist – they stay one click away.
  const { assignee, ...others } = filters;
  const filterActive = hasFilters(mine ? others : { ...others, ...(assignee ? { assignee } : {}) });
  const [showFilters, setShowFilters] = useState(() => views.length > 0 || filterActive);
  const chip = (active: boolean) =>
    cn(
      "inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-badge)] px-2.5 text-[13px] whitespace-nowrap",
      active ? "bg-accent-soft font-medium text-accent-strong" : "text-secondary hover:bg-hover hover:text-text",
    );
  const selectInChip = "h-7 cursor-pointer rounded-[var(--radius-badge)] bg-transparent px-1 font-medium text-text";

  return (
    <ProjectInfoProvider value={providerValue}>
      <div className="flex flex-col gap-4">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
            {project.icon ? <span aria-hidden className="text-xl">{project.icon}</span> : null}
            <h1 className="truncate text-[22px] leading-tight font-bold">{project.name}</h1>
            <span className="rounded border border-border px-1.5 font-mono text-xs text-muted">{project.key}</span>
          </div>
          <p className="text-sm text-muted tabular-nums">{t.list.counts(openCount, tickets.length)}</p>
          <span role="status" aria-live="polite" className="text-xs text-muted">
            {saving ? t.list.savingAll : ""}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href={`/${info.slug}/p/${project.key}/settings`}
              aria-label={t.explorer.settings}
              title={t.explorer.settings}
              className="flex size-8 items-center justify-center rounded-[var(--radius-badge)] text-muted hover:bg-hover hover:text-text"
            >
              <Settings />
            </Link>
            <Button variant="primary" aria-keyshortcuts="C" onClick={() => quickAdd.current?.focus()}>
              <Plus />
              {t.list.newTicket}
            </Button>
          </div>
        </header>

        <div className="flex flex-wrap items-start gap-2">
          <label className="sr-only" htmlFor="new-ticket-type">{t.hierarchy.newTicketType}</label>
          <select
            id="new-ticket-type"
            value={newType}
            onChange={(e) => setNewType(NEW_TYPES.find((x) => x === e.target.value) ?? "task")}
            className="h-10 cursor-pointer rounded-[var(--radius-field)] border border-border bg-content px-2 text-sm text-secondary hover:bg-hover"
          >
            {NEW_TYPES.map((type) => <option key={type} value={type}>{t.hierarchy.types[type]}</option>)}
          </select>
          <div className="min-w-56 flex-1">
            <QuickAdd ref={quickAdd} onCreate={({ title, assigneeId, priority, dueDate }) => create.mutate({ title, assigneeId, priority, dueDate, type: newType })} />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-x-4 gap-y-1 border-b border-border">
          <div role="group" aria-label={t.view.switcher} className="-mb-px flex gap-4">
            {(["list", "board"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                aria-keyshortcuts={v === "list" ? "L" : "B"}
                onClick={() => switchView(v)}
                className={cn(
                  "inline-flex items-center gap-1.5 border-b-2 px-1 pt-1 pb-2 text-sm",
                  view === v ? "border-accent font-semibold text-accent-strong" : "border-transparent text-secondary hover:text-text",
                )}
              >
                {v === "list" ? <ListIcon /> : <KanbanIcon />}
                {t.view[v]}
              </button>
            ))}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-1 pb-1.5">
            <button type="button" aria-expanded={showFilters} aria-controls="ticket-filters" onClick={() => setShowFilters((s) => !s)} className={chip(showFilters || filterActive)}>
              <FilterIcon />
              {t.filters.label}
              {filterActive ? <span className="sr-only"> {t.list.filterActive}</span> : null}
            </button>
            <button
              type="button"
              aria-pressed={mine}
              onClick={() => {
                setParams({ assignee: mine ? null : "me" });
                if (!mine) trackEvent("Filter", "Only mine");
              }}
              className={chip(mine)}
            >
              <Person />
              {t.list.mine}
            </button>
            {view === "list" ? (
              <>
                <label className={cn(chip(groupBy !== "status"), "pr-1")}>
                  {t.list.groupBy}
                  <select value={groupBy} onChange={(e) => setParams({ group: e.target.value === "status" ? null : e.target.value })} className={selectInChip}>
                    {GROUPS.map((g) => <option key={g} value={g}>{t.list.groups[g]}</option>)}
                  </select>
                </label>
                <label className={cn(chip(sortBy !== "manual"), "pr-1")}>
                  {t.list.sortBy}
                  <select value={sortBy} onChange={(e) => setParams({ sort: e.target.value === "manual" ? null : e.target.value })} className={selectInChip}>
                    {SORTS.map((s) => <option key={s} value={s}>{t.list.sorts[s]}</option>)}
                  </select>
                </label>
                <ListOptions
                  chip={chip}
                  showDone={showDone}
                  onShowDone={(on) => setParams({ done: on ? "1" : null })}
                  showSubtasks={showSubtasks}
                  onShowSubtasks={(on) => setParams({ subtasks: on ? "1" : null })}
                  hidden={hiddenColumns}
                  onHidden={setHiddenColumns}
                />
              </>
            ) : null}
          </div>
        </div>

        {showFilters ? (
          <FilterBar
            id="ticket-filters"
            filters={filters}
            onChange={(patch) => setParams(patch)}
            onApplyQuery={(query) => {
              const url = new URL(window.location.href);
              url.search = query;
              window.history.replaceState(null, "", url);
              for (const listener of paramListeners) listener();
            }}
            currentQuery={currentQuery}
            views={views}
            onViewsChange={setViews}
            shown={filtered.length}
            total={tickets.length}
          />
        ) : null}

        {view === "board" ? (
          <Board
            tickets={filtered}
            today={today}
            onOpen={open}
            onCreate={(title, statusId) => create.mutate({ title, statusId })}
            onMove={(move, rect) => {
              const from = statuses.find((s) => s.id === tickets.find((t) => t.id === move.ticketId)?.statusId);
              const to = statuses.find((s) => s.id === move.statusId);
              update.mutate({ ticketId: move.ticketId, patch: move.statusId === from?.id ? { sort: move.sort } : { statusId: move.statusId, sort: move.sort } });
              if (confetti && to?.category === "done" && from?.category !== "done" && rect) {
                confettiBurst(rect.left + rect.width / 2, rect.top + 40, project.color);
              }
            }}
          />
        ) : listed.length === 0 && hiddenDone === 0 ? (
          <p className="rounded-[var(--radius-card)] border border-dashed border-border p-8 text-center text-muted">{tickets.length === 0 ? t.list.empty : t.filters.noMatch}</p>
        ) : (
          <TicketList
            groups={groups}
            groupBy={groupBy}
            selected={selected}
            today={today}
            openTicketId={openTicket?.id ?? null}
            onOpen={open}
            onPatch={(ticketId, patch) => update.mutate({ ticketId, patch })}
            hidden={hiddenColumns}
            showSubtasks={showSubtasks}
            onAddToGroup={groupBy === "status" ? (statusId, title) => create.mutate({ title, statusId }) : undefined}
            onToggleSelect={(ids, select) =>
              setSelected((prev) => {
                const next = new Set(prev);
                for (const id of ids) {
                  if (select) next.add(id);
                  else next.delete(id);
                }
                return next;
              })
            }
          />
        )}
        {view === "list" ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {canAdmin ? <NewStatusRow key={statuses.length} workspaceId={workspaceId} projectKey={project.key} /> : null}
            {hiddenDone > 0 ? (
              <p className="text-xs text-muted" role="status">
                {t.list.doneHidden(hiddenDone)}{" "}
                <button type="button" onClick={() => setParams({ done: "1" })} className="text-accent-strong underline underline-offset-2">
                  {t.list.showDone}
                </button>
              </p>
            ) : null}
          </div>
        ) : null}

        <BulkBar
          count={selected.size}
          onClear={() => setSelected(new Set())}
          onApply={(patch) => {
            bulk.mutate({ ticketIds: [...selected], patch });
            setSelected(new Set());
          }}
        />
      </div>

      <SlideOver open={Boolean(openTicket)} onClose={close} title={openTicket ? `${project.key}-${openTicket.number}` : t.detail.close} hideTitle>
        {openTicket ? (
          <TicketDetail
            key={openTicket.id}
            ticket={openTicket}
            tickets={tickets}
            onOpen={open}
            onCreateChild={(input) => create.mutate({ ...input, parentId: openTicket.id })}
            onPatch={(patch) => update.mutate({ ticketId: openTicket.id, patch })}
            onNavigate={navigate}
            onLabelCreated={(l) => setLabels((prev) => (prev.some((x) => x.id === l.id) ? prev : [...prev, l].sort((a, b) => a.name.localeCompare(b.name, "de"))))}
          />
        ) : null}
      </SlideOver>
    </ProjectInfoProvider>
  );
}
