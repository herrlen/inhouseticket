"use client";

import { useState, useTransition } from "react";
import { createSavedViewAction, deleteSavedViewAction } from "@/app/(app)/[workspace]/actions";
import type { SavedViewRow } from "@/db/queries/views";
import { Button } from "@/components/ui/button";
import { Dropdown } from "@/components/ui/dropdown";
import { ChevronDown, Close, Plus } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/client";
import { useProjectInfo } from "./context";
import { hasFilters, type Filters } from "./filters";
import { priorityKey } from "./list-model";
import { PriorityIcon } from "./pickers";
import { TypeIcon } from "./type-icon";
import { TICKET_TYPES } from "@/lib/ticket-hierarchy";
import deHierarchy from "@/lib/i18n/de/hierarchy";
import deCommon from "@/lib/i18n/de/common";
import deFilters from "@/lib/i18n/de/filters";
import deList from "@/lib/i18n/de/list";
import dePriority from "@/lib/i18n/de/priority";
import deViews from "@/lib/i18n/de/views";

const MESSAGES = { common: deCommon, filters: deFilters, hierarchy: deHierarchy, list: deList, priority: dePriority, views: deViews };

type Props = {
  /** The panel id (the "Filter" button in the toolbar controls it). */
  id: string;
  filters: Filters;
  onChange: (patch: Record<string, string | null>) => void;
  onApplyQuery: (query: string) => void;
  currentQuery: string;
  views: SavedViewRow[];
  onViewsChange: (views: SavedViewRow[]) => void;
  shown: number;
  total: number;
};

// Borderless chips (Redesign X2); an active filter is tinted and bold.
const chip = (active: boolean) =>
  cn(
    "inline-flex h-8 items-center gap-1 rounded-[var(--radius-badge)] px-2.5 text-[13px]",
    active ? "bg-accent-soft font-medium text-accent-strong" : "text-secondary hover:bg-hover hover:text-text",
  );
const caret = <ChevronDown size={14} className="shrink-0" />;

export function FilterBar({ id, filters, onChange, onApplyQuery, currentQuery, views, onViewsChange, shown, total }: Props) {
  const t = useT(MESSAGES);
  const { members, labels, currentUserId, workspaceId, project } = useProjectInfo();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  const personLabel =
    filters.assignee === "me" ? t.filters.me : filters.assignee === "none" ? t.list.unassigned : members.find((m) => m.id === filters.assignee)?.name;
  const labelName = labels.find((l) => l.id === filters.label)?.name;
  const active = hasFilters(filters);

  function saveView() {
    const n = name.trim();
    if (!n) return;
    startTransition(async () => {
      const r = await createSavedViewAction({ workspaceId, projectId: project.id, name: n, query: currentQuery });
      if (!r.ok) return toast({ message: r.error, tone: "error" });
      onViewsChange([...views, r.view]);
      toast({ message: t.views.saved(n), tone: "success" });
      setNaming(false);
      setName("");
    });
  }

  return (
    <div id={id} className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-border p-2">
      <div role="group" aria-label={t.filters.label} className="flex flex-wrap items-center gap-2">
        <Dropdown
          trigger={<>{t.filters.person}{personLabel ? `: ${personLabel}` : ""}{caret}</>}
          triggerClassName={chip(Boolean(filters.assignee))}
          items={[
            { label: t.filters.all, onSelect: () => onChange({ assignee: null }) },
            { label: t.filters.me, onSelect: () => onChange({ assignee: "me" }) },
            { label: t.list.unassigned, onSelect: () => onChange({ assignee: "none" }) },
            ...members.filter((m) => m.id !== currentUserId).map((m) => ({ label: m.name, onSelect: () => onChange({ assignee: m.id }) })),
          ]}
        />
        <Dropdown
          trigger={<>{t.filters.priority}{filters.priority !== undefined ? `: ${t.priority[priorityKey(filters.priority)]}` : ""}{caret}</>}
          triggerClassName={chip(filters.priority !== undefined)}
          items={[
            { label: t.filters.all, onSelect: () => onChange({ priority: null }) },
            ...[4, 3, 2, 1, 0].map((p) => ({ label: t.priority[priorityKey(p)], icon: <PriorityIcon priority={p} />, onSelect: () => onChange({ priority: String(p) }) })),
          ]}
        />
        <Dropdown
          trigger={<>{t.filters.due}{filters.due ? `: ${t.list.due[filters.due]}` : ""}{caret}</>}
          triggerClassName={chip(Boolean(filters.due))}
          items={[
            { label: t.filters.all, onSelect: () => onChange({ due: null }) },
            ...(["overdue", "today", "week", "later", "none"] as const).map((d) => ({ label: t.list.due[d], onSelect: () => onChange({ due: d }) })),
          ]}
        />
        <Dropdown
          trigger={<>{t.hierarchy.filter}{filters.type ? `: ${t.hierarchy.types[filters.type]}` : ""}{caret}</>}
          triggerClassName={chip(Boolean(filters.type))}
          items={[
            { label: t.filters.all, onSelect: () => onChange({ type: null }) },
            ...TICKET_TYPES.map((type) => ({ label: t.hierarchy.types[type], icon: <TypeIcon type={type} />, onSelect: () => onChange({ type }) })),
          ]}
        />
        {labels.length > 0 ? (
          <Dropdown
            trigger={<>{t.filters.labelFilter}{labelName ? `: ${labelName}` : ""}{caret}</>}
            triggerClassName={chip(Boolean(filters.label))}
            items={[{ label: t.filters.all, onSelect: () => onChange({ label: null }) }, ...labels.map((l) => ({ label: l.name, onSelect: () => onChange({ label: l.id }) }))]}
          />
        ) : null}
        <label className="sr-only" htmlFor="filter-text">{t.filters.text}</label>
        <input
          id="filter-text"
          type="search"
          defaultValue={filters.q ?? ""}
          key={filters.q ?? ""}
          placeholder={t.filters.textPlaceholder}
          onChange={(e) => onChange({ q: e.target.value.trim() || null })}
          className="h-8 w-44 rounded-[var(--radius-field)] border border-border bg-content px-2.5 text-[13px] placeholder:text-muted"
        />
        {active ? (
          <>
            <button type="button" onClick={() => onApplyQuery(new URLSearchParams(currentQuery).has("view") ? "view=board" : "")} className="rounded-[var(--radius-badge)] px-1 text-[13px] text-accent-strong hover:underline">
              {t.filters.reset}
            </button>
            <span className="text-xs text-muted" aria-live="polite">{t.filters.count(shown, total)}</span>
          </>
        ) : null}
        <span className="ml-auto" />
        {naming ? (
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              saveView();
            }}
          >
            <label className="sr-only" htmlFor="view-name">{t.views.namePlaceholder}</label>
            <input
              id="view-name"
              autoFocus
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setNaming(false);
                }
              }}
              placeholder={t.views.namePlaceholder}
              className="h-8 w-44 rounded-[var(--radius-field)] border border-accent bg-content px-2 text-[13px]"
            />
            <Button type="submit" size="sm" variant="primary">{t.common.save}</Button>
          </form>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setNaming(true)}>
            <Plus size={14} />
            {t.views.save}
          </Button>
        )}
      </div>
      {views.length > 0 ? (
        <ul aria-label={t.views.label} className="flex flex-wrap items-center gap-1.5">
          {views.map((v) => {
            const isActive = v.query === currentQuery;
            return (
              <li key={v.id} className={cn("inline-flex items-center rounded-[var(--radius-badge)] text-[13px]", isActive ? "bg-accent-soft font-medium text-accent-strong" : "bg-hover text-secondary")}>
                <button type="button" aria-pressed={isActive} onClick={() => onApplyQuery(v.query)} className="h-7 rounded-[var(--radius-badge)] pr-1 pl-2.5">
                  {v.name}
                </button>
                <button
                  type="button"
                  aria-label={t.views.remove(v.name)}
                  onClick={() =>
                    startTransition(async () => {
                      onViewsChange(views.filter((x) => x.id !== v.id));
                      const r = await deleteSavedViewAction({ workspaceId, viewId: v.id });
                      if (!r.ok) toast({ message: r.error, tone: "error" });
                    })
                  }
                  className="mr-1 rounded p-1 text-muted hover:text-text"
                >
                  <Close size={12} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
