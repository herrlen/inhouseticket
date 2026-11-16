"use client";
// Darstellung (Redesign X3, like emuchat's components/theme-form.tsx): presets or own colors, a live
// preview and a hint when a color had to move for contrast. Used for your own colors and for the
// workspace default (admins). This app has no dark rail, so only accent, sidebar and background
// are editable; the stored format stays emuchat's (four colors).
import { useRouter } from "next/navigation";
import { useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { Check, Warning } from "@/components/ui/icons";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/client";
import deAppearance from "@/lib/i18n/de/appearance";
import { themeVars } from "@/lib/theme/css";
import { PRESET_IDS, PRESETS, type PresetId, type ThemeColors, type ThemeInput } from "@/lib/theme/engine";
import { saveMyThemeAction, saveWorkspaceThemeAction, type ThemeResult } from "./actions";

const MESSAGES = { appearance: deAppearance };
const FIELDS = ["accent", "surface", "bg"] as const;
type Field = (typeof FIELDS)[number];
const HEX = /^#[0-9a-f]{6}$/i;

function colorsOf(theme: ThemeInput | null): ThemeColors {
  if (!theme) return PRESETS.emu.colors;
  return theme.preset === "custom" ? theme.colors : PRESETS[theme.preset].colors;
}

export function ThemeForm({ initial, workspaceId, scope }: { initial: ThemeInput | null; workspaceId: string; scope: "user" | "workspace" }) {
  const t = useT(MESSAGES).appearance;
  const router = useRouter();
  const [preset, setPreset] = useState<PresetId | "custom">(initial?.preset ?? "emu");
  const [colors, setColors] = useState<ThemeColors>(colorsOf(initial));
  const [drafts, setDrafts] = useState<Record<Field, string>>(colorsOf(initial));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const theme: ThemeInput = preset === "custom" ? { preset, colors } : { preset };
  const vars = themeVars(theme);
  const corrected = (vars?.corrected ?? []).filter((c): c is Field => (FIELDS as readonly string[]).includes(c));
  const preview = vars ? (Object.fromEntries(Object.entries(vars.light).map(([k, v]) => [`--${k}`, v])) as CSSProperties) : undefined;

  const choosePreset = (id: PresetId) => {
    setPreset(id);
    setColors(PRESETS[id].colors);
    setDrafts(PRESETS[id].colors);
  };
  const setColor = (key: Field, value: string) => {
    setDrafts((d) => ({ ...d, [key]: value }));
    if (!HEX.test(value)) return;
    setPreset("custom");
    setColors((c) => ({ ...c, [key]: value.toLowerCase() }));
  };

  const save = async (value: ThemeInput | null) => {
    setBusy(true);
    setMessage(null);
    let r: ThemeResult;
    try {
      r = scope === "user" ? await saveMyThemeAction(workspaceId, value) : await saveWorkspaceThemeAction(workspaceId, value);
    } catch {
      r = { ok: false, error: t.failed };
    }
    setBusy(false);
    if (!r.ok) return setMessage({ ok: false, text: r.error });
    trackEvent("Darstellung", `${scope === "user" ? "Eigene" : "Workspace"}: ${value ? (value.preset === "custom" ? "Eigene Farben" : PRESETS[value.preset].name) : "zurückgesetzt"}`);
    if (!value) choosePreset("emu");
    setMessage({ ok: true, text: value ? t.saved : t.reset });
    router.refresh();
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-5">
        <fieldset>
          <legend className="mb-2 text-[13px] font-semibold">{t.presets}</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PRESET_IDS.map((id) => {
              const c = PRESETS[id].colors;
              const on = preset === id;
              return (
                <label
                  key={id}
                  className={cn(
                    "flex cursor-pointer flex-col items-center gap-1.5 rounded-[var(--radius-field)] border p-2 text-[13px] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
                    on ? "border-accent bg-accent-soft font-semibold text-accent-strong" : "border-border hover:bg-hover",
                  )}
                >
                  <input type="radio" name={`preset-${scope}`} value={id} checked={on} onChange={() => choosePreset(id)} className="sr-only" />
                  <span aria-hidden className="flex h-8 w-full overflow-hidden rounded border border-border-subtle">
                    <span className="w-1/4" style={{ background: c.surface }} />
                    <span className="w-1/4" style={{ background: c.bg }} />
                    <span className="w-1/2" style={{ background: c.accent }} />
                  </span>
                  {PRESETS[id].name}
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-[13px] font-semibold">
            {t.custom}
            {preset === "custom" ? <span className="ml-2 font-normal text-muted">{t.active}</span> : null}
          </legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {FIELDS.map((key) => {
              const id = `theme-${scope}-${key}`;
              const label = t.fields[key];
              const valid = HEX.test(drafts[key]);
              return (
                <div key={key} className="flex min-w-0 flex-col gap-1">
                  <label htmlFor={id} className="text-[13px] text-muted">
                    {label}
                  </label>
                  <div className="flex items-center gap-2 rounded-[var(--radius-field)] border border-border px-2 focus-within:border-accent">
                    <input type="color" aria-label={t.pick(label)} value={colors[key]} onChange={(e) => setColor(key, e.target.value)} className="size-7 cursor-pointer rounded border-0 bg-transparent p-0" />
                    <input
                      id={id}
                      value={drafts[key]}
                      maxLength={7}
                      spellCheck={false}
                      aria-invalid={!valid}
                      onChange={(e) => setColor(key, e.target.value.trim())}
                      className="h-9 min-w-0 flex-1 bg-transparent font-mono text-[13px] uppercase focus:outline-none"
                    />
                  </div>
                  {!valid ? <p className="text-xs text-danger">{t.hexHint}</p> : null}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted">{t.derived}</p>
        </fieldset>

        <p role="status" className={cn("flex items-start gap-2 rounded-[var(--radius-field)] p-3 text-[13px] text-text", corrected.length ? "bg-accent-soft" : "bg-bg")}>
          {corrected.length ? <Warning className="mt-0.5 shrink-0 text-warning" /> : <Check className="mt-0.5 shrink-0 text-success" />}
          <span>
            <strong>{corrected.length ? `${t.corrected} ${corrected.map((c) => t.fields[c]).join(", ")}.` : t.contrastOk}</strong> {t.autoFix}
          </span>
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" disabled={busy || FIELDS.some((f) => !HEX.test(drafts[f]))} onClick={() => void save(theme)}>
            {t.save}
          </Button>
          <Button disabled={busy} onClick={() => void save(null)}>
            {scope === "user" ? t.resetMine : t.resetWorkspace}
          </Button>
          {message ? (
            <span role={message.ok ? "status" : "alert"} className={cn("text-[13px]", message.ok ? "text-success" : "text-danger")}>
              {message.text}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-semibold">{t.preview}</p>
        <div aria-hidden style={preview} className="flex h-60 overflow-hidden rounded-[var(--radius-card)] border border-border bg-content text-xs text-text">
          <div className="flex w-32 flex-col gap-1 border-r border-border bg-sidebar p-2">
            {t.previewNav.map((item, i) => (
              <span key={item} className={cn("rounded px-1.5 py-0.5", i === 2 ? "bg-accent-soft font-semibold text-accent-strong" : "text-secondary")}>
                {item}
              </span>
            ))}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-bold">{t.previewProject}</span>
              <span className="rounded-[var(--radius-field)] bg-accent px-2 py-1 font-semibold text-accent-contrast">{t.previewNew}</span>
            </div>
            <span className="w-fit rounded bg-status-progress px-1 text-[10px] font-bold text-status-fg">{t.previewProgress}</span>
            <div className="flex justify-between border-b border-border-subtle pb-1">
              <span>{t.previewRows[0]}</span>
              <span className="text-danger">{t.previewToday}</span>
            </div>
            <div className="flex justify-between rounded bg-bg px-1 pb-1">
              <span>{t.previewRows[1]}</span>
              <span className="text-muted">18.11.</span>
            </div>
            <span className="w-fit rounded bg-status-open-bg px-1 text-[10px] font-bold text-status-open-fg">{t.previewOpen}</span>
            <div className="flex justify-between border-b border-border-subtle pb-1">
              <span>{t.previewRows[2]}</span>
              <span className="text-accent">–</span>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted">{t.fixedNote}</p>
      </div>
    </div>
  );
}
