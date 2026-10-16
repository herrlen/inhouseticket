"use client";

import { useIsMutating } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LabelRow, MemberOption, TicketRow } from "@/db/queries/tickets";
import type { SavedViewRow } from "@/db/queries/views";
import { cleanViewQuery } from "@/lib/view-query";
import { FilterBar } from "./filter-bar";
import { applyFilters, readFilters } from "./filters";
import { SlideOver } from "@/components/ui/dialog";
import { useT } from "@/lib/i18n/client";
import { usePrefs } from "@/components/shell/prefs-context";
import { confettiBurst } from "@/lib/confetti";
import { cn } from "@/lib/cn";
import { BulkBar } from "./bulk-bar";
import { ProjectInfoProvider, type ProjectInfo } from "./context";
import { groupTickets, todayInBerlin, type GroupBy, type SortBy, type StatusOption } from "./list-model";
import { QuickAdd } from "./quick-add";
import { TicketList } from "./ticket-list";
import { useBulkUpdate, useCreateTicket, useTickets, useUpdateTicket } from "./use-tickets";

// Loaded on demand to keep the list view within the JS budget (≤ 200 KB gzip): the board pulls in
// dnd-kit, the detail panel Markdown, uploads and comments.
const Board = dynamic(() => import("./board").then((m) => m.Board), {
  loading: () => <div className="h-[60vh] animate-pulse rounded-[var(--radius-card)] bg-bg" aria-hidden />,
});
const TicketDetail = dynamic(() => import("./ticket-detail").then((m) => m.TicketDetail), {
  loading: () => <div className="h-96 animate-pulse rounded-[var(--radius-badge)] bg-bg" aria-hidden />,
});

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

/** Updates the query string without a server round trip (Next syncs useSearchParams). */
function setParams(patch: Record<string, string | null>, mode: "push" | "replace" = "replace") {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  window.history[mode === "push" ? "pushState" : "replaceState"](null, "", url);
}

const isEditable = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || Boolean(el.closest("[role=menu],dialog")));

export function ProjectView({ info, statuses, members, labels: initialLabels, initialTickets, savedViews }: Props) {
  const t = useT();
  const params = useSearchParams();
  const groupBy = (GROUPS.find((g) => g === params.get("group")) ?? "status") as GroupBy;
  const sortBy = (SORTS.find((s) => s === params.get("sort")) ?? "manual") as SortBy;
  const openKey = params.get("t");
  const view = params.get("view") === "board" ? "board" : "list";
  const { confetti } = usePrefs();

  const [labels, setLabels] = useState(initialLabels);
  const [views, setViews] = useState(savedViews);
  const filters = useMemo(() => readFilters(params), [params]);
  const currentQuery = cleanViewQuery(params);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const quickAdd = useRef<HTMLInputElement>(null);

  const { workspaceId, project } = info;
  const { data: tickets } = useTickets(workspaceId, project.id, initialTickets);
  const update = useUpdateTicket(workspaceId, project.id);
  const create = useCreateTicket(workspaceId, project.id);
  const bulk = useBulkUpdate(workspaceId, project.id);

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
  const filtered = useMemo(
    () => applyFilters(tickets, filters, { currentUserId: info.currentUserId, today, doneStatusIds, projectKey: project.key }),
    [tickets, filters, info.currentUserId, today, doneStatusIds, project.key],
  );
  const groups = useMemo(() => groupTickets(filtered, { groupBy, sortBy, statuses, members, today, t }), [filtered, groupBy, sortBy, statuses, members, today, t]);
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
        setParams({ view: key === "b" ? "board" : null });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const open = (ticketId: string) => {
    const t = tickets.find((x) => x.id === ticketId);
    if (t) setParams({ t: `${project.key}-${t.number}` }, openKey ? "replace" : "push");
  };
  const close = () => {
    // Return focus to where the ticket was opened from: the list row or the board card.
    const row = openTicket
      ? document.querySelector<HTMLElement>(`[data-ticket-row="${openTicket.id}"] button, [data-card="${openTicket.id}"]`)
      : null;
    setParams({ t: null });
    requestAnimationFrame(() => row?.focus());
  };
  const navigate = (direction: 1 | -1) => {
    if (!openTicket) return;
    const i = visibleOrder.findIndex((t) => t.id === openTicket.id);
    const next = visibleOrder[i + direction];
    if (next) open(next.id);
  };

  const providerValue: ProjectInfo = { ...info, statuses, members, labels };

  return (
    <ProjectInfoProvider value={providerValue}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label={t.view.switcher} className="inline-flex rounded-[var(--radius-badge)] border border-border bg-surface p-0.5">
            {(["list", "board"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                aria-keyshortcuts={v === "list" ? "L" : "B"}
                onClick={() => setParams({ view: v === "board" ? "board" : null })}
                className={cn("h-7 rounded px-2.5 text-[13px]", view === v ? "bg-bg font-medium" : "text-muted hover:text-text")}
              >
                {t.view[v]}
              </button>
            ))}
          </div>
          <span role="status" aria-live="polite" className="order-last w-full text-xs text-muted sm:order-none sm:w-auto">
            {saving ? t.list.savingAll : ""}
          </span>
          <div className="min-w-64 flex-1">
            <QuickAdd ref={quickAdd} onCreate={({ title, assigneeId, priority, dueDate }) => create.mutate({ title, assigneeId, priority, dueDate })} />
          </div>
          {view === "list" ? (
          <>
          <label className="flex items-center gap-1.5 text-[13px] text-muted">
            {t.list.groupBy}
            <select value={groupBy} onChange={(e) => setParams({ group: e.target.value === "status" ? null : e.target.value })} className="h-8 rounded-[var(--radius-badge)] border border-border bg-surface px-2 text-text">
              {GROUPS.map((g) => <option key={g} value={g}>{t.list.groups[g]}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[13px] text-muted">
            {t.list.sortBy}
            <select value={sortBy} onChange={(e) => setParams({ sort: e.target.value === "manual" ? null : e.target.value })} className="h-8 rounded-[var(--radius-badge)] border border-border bg-surface px-2 text-text">
              {SORTS.map((s) => <option key={s} value={s}>{t.list.sorts[s]}</option>)}
            </select>
          </label>
          </>
          ) : null}
        </div>

        <FilterBar
          filters={filters}
          onChange={(patch) => setParams(patch)}
          onApplyQuery={(query) => {
            const url = new URL(window.location.href);
            url.search = query;
            window.history.replaceState(null, "", url);
          }}
          currentQuery={currentQuery}
          views={views}
          onViewsChange={setViews}
          shown={filtered.length}
          total={tickets.length}
        />

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
        ) : filtered.length === 0 ? (
          <p className="rounded-[var(--radius-card)] border border-dashed border-border p-8 text-center text-muted">{tickets.length === 0 ? t.list.empty : t.filters.noMatch}</p>
        ) : (
          <TicketList
            groups={groups}
            showGroupHeaders={groupBy !== "none"}
            selected={selected}
            today={today}
            openTicketId={openTicket?.id ?? null}
            onOpen={open}
            onPatch={(ticketId, patch) => update.mutate({ ticketId, patch })}
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
            onPatch={(patch) => update.mutate({ ticketId: openTicket.id, patch })}
            onNavigate={navigate}
            onLabelCreated={(l) => setLabels((prev) => (prev.some((x) => x.id === l.id) ? prev : [...prev, l].sort((a, b) => a.name.localeCompare(b.name, "de"))))}
          />
        ) : null}
      </SlideOver>
    </ProjectInfoProvider>
  );
}
