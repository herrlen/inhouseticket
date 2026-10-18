"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { MultiPills, SinglePills } from "@/components/onboarding/pills";
import { Avatar } from "@/components/ui/avatar";
import { ColorPicker } from "@/components/ui/color-picker";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/client";
import { MAX_NAME, MAX_SOURCE_OTHER } from "@/lib/limits";
import { IMPORTABLE_TOOLS, PREVIOUS_TOOLS, SOURCES, TEAM_TYPES, type View } from "@/lib/onboarding/options";
import { useHydrated } from "@/lib/use-hydrated";
import type { StepProps } from "./wizard-state";

const ICONS = { marketing: "📣", it: "🖥️", support: "🎧", office: "🗂️", sales: "🤝", creative: "🎨", dev: "🧑‍💻", general: "📋" } as const;

/** All IANA zones the browser knows; only after hydration (the server's list may differ). */
function useTimeZones(current: string): string[] {
  const hydrated = useHydrated();
  return useMemo(() => {
    if (!hydrated) return [current];
    const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    return all.includes(current) ? all : [current, ...all];
  }, [hydrated, current]);
}

export function ProfileStep({ data, set, errors, props }: StepProps) {
  const t = useT().onboarding.profile;
  const zones = useTimeZones(data.timezone);
  const { detectTimezone } = props.profile;
  useEffect(() => {
    if (!detectTimezone) return;
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected) set({ timezone: detected });
  }, [detectTimezone, set]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-3">
        <Input
          label={t.name}
          value={data.name}
          onChange={(e) => set({ name: e.target.value })}
          maxLength={MAX_NAME}
          autoComplete="name"
          required
          data-autofocus
          error={errors.name}
          className="flex-1"
        />
        <span className="mb-6" title={t.avatar}>
          <Avatar user={{ id: props.profile.userId, name: data.name || "?" }} size="lg" />
        </span>
      </div>
      <p className="-mt-2 text-xs text-muted">{t.avatarHint}</p>
      <label className="flex flex-col gap-1 text-[13px] font-medium">
        {t.timezone}
        <select
          value={data.timezone}
          onChange={(e) => set({ timezone: e.target.value })}
          aria-describedby="tz-hint"
          className="h-9 rounded-[var(--radius-badge)] border border-border bg-surface px-2 text-sm font-normal"
        >
          {zones.map((z) => (
            <option key={z} value={z}>
              {z.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <span id="tz-hint" className="text-xs font-normal text-muted">{errors.timezone ?? t.timezoneHint}</span>
      </label>
    </div>
  );
}

export function WorkspaceStep({ data, set, errors, props }: StepProps) {
  const t = useT();
  const w = t.onboarding.workspace;
  return (
    <div className="flex flex-col gap-5">
      <Input label={w.name} value={data.wsName} onChange={(e) => set({ wsName: e.target.value })} maxLength={100} required data-autofocus error={errors.name} />
      <ColorPicker name="color" legend={w.color} defaultValue={data.color} error={errors.color} />
      {props.workspace.personal ? null : (
        <label className="flex items-start gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={data.autoJoin}
            onChange={(e) => set({ autoJoin: e.target.checked })}
            aria-describedby="autojoin-hint"
            className="mt-0.5 size-4 accent-[var(--accent)]"
          />
          <span className="flex flex-col gap-0.5">
            <span className="font-medium">{w.autoJoin(props.workspace.domain)}</span>
            <span id="autojoin-hint" className="text-xs text-muted">{w.autoJoinHint}</span>
          </span>
        </label>
      )}
      {props.workspace.id ? null : (
        <p className="text-xs text-muted">
          {w.termsBefore}
          <Link href="/agb" target="_blank" className="text-accent underline">{t.legal.terms}</Link>
          {w.termsBetween}
          <Link href="/avv" target="_blank" className="text-accent underline">{w.termsAvv}</Link>
          {w.termsAfter}
        </p>
      )}
    </div>
  );
}

export function TeamStep({ data, set }: StepProps) {
  const t = useT().onboarding.team;
  return (
    <div>
      <p id="team-label" className="sr-only">{t.label}</p>
      <SinglePills
        labelledBy="team-label"
        value={data.teamType}
        onChange={(teamType) => set({ teamType })}
        options={TEAM_TYPES.map((v) => ({ value: v, label: t.types[v], icon: ICONS[v] }))}
      />
    </div>
  );
}

function MiniPreview({ view }: { view: View }) {
  const cell = "rounded-sm bg-border";
  return (
    <span aria-hidden className="flex h-16 gap-1.5 rounded-[var(--radius-badge)] border border-border bg-bg p-2">
      {view === "board"
        ? [3, 2, 1].map((n, i) => (
            <span key={i} className="flex flex-1 flex-col gap-1">
              {Array.from({ length: n }, (_, j) => <span key={j} className={`h-3 ${cell} bg-surface ring-1 ring-border`} />)}
            </span>
          ))
        : (
          <span className="flex flex-1 flex-col gap-1.5">
            {[0, 1, 2, 3].map((i) => <span key={i} className={`h-1.5 ${cell}`} />)}
          </span>
        )}
    </span>
  );
}

export function ViewStep({ data, set }: StepProps) {
  const t = useT().onboarding.view;
  return (
    <div>
      <p id="view-label" className="sr-only">{t.label}</p>
      <SinglePills
        labelledBy="view-label"
        variant="card"
        className="grid grid-cols-2"
        value={data.view}
        onChange={(view) => set({ view })}
        options={(["board", "list"] as const).map((v) => ({ value: v, label: t[v], hint: t[`${v}Hint`], preview: <MiniPreview view={v} /> }))}
      />
    </div>
  );
}

export function QuestionsStep({ data, set, errors }: StepProps) {
  const t = useT().onboarding.questions;
  const showImport = data.tools.some((tool) => IMPORTABLE_TOOLS.has(tool));
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p id="tools-label" className="text-[13px] font-medium">
          {t.tools} <span id="tools-hint" className="font-normal text-muted">({t.toolsHint})</span>
        </p>
        <MultiPills
          labelledBy="tools-label"
          describedBy="tools-hint"
          value={data.tools}
          onChange={(tools) => set({ tools })}
          options={PREVIOUS_TOOLS.map((v) => ({ value: v, label: t.toolNames[v] }))}
        />
        {showImport ? <p className="text-xs text-muted" role="status">{t.importHint}</p> : null}
      </div>
      <div className="flex flex-col gap-2">
        <p id="source-label" className="text-[13px] font-medium">{t.source}</p>
        <SinglePills
          labelledBy="source-label"
          value={data.source}
          onChange={(source) => set({ source })}
          options={SOURCES.map((v) => ({ value: v, label: t.sources[v] }))}
        />
        {data.source === "other" ? (
          <Input
            label={t.sourceOther}
            value={data.sourceOther}
            onChange={(e) => set({ sourceOther: e.target.value })}
            maxLength={MAX_SOURCE_OTHER}
            showCounter
            error={errors.sourceOther}
          />
        ) : null}
      </div>
    </div>
  );
}
