"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

// Big choice pills for the onboarding wizard (docs/ONBOARDING.md §1.3, §7). Single choice is a
// radiogroup (arrow keys move and select, Space selects), multiple choice a group of toggle
// buttons with aria-pressed (arrow keys move, Space toggles). Enter submits the surrounding form
// ("Drücke Enter, um fortzufahren"). Selection is shown by a check mark too, never by color alone.

export type PillOption<V extends string> = { value: V; label: string; hint?: string; icon?: ReactNode; preview?: ReactNode };

type Common<V extends string> = {
  options: readonly PillOption<V>[];
  /** id of the visible question that names the group. */
  labelledBy: string;
  describedBy?: string;
  /** "card": larger tiles with an optional preview (start view). */
  variant?: "pill" | "card";
  className?: string;
};

const NEXT_KEYS: Record<string, 1 | -1> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

function submitForm(el: HTMLElement) {
  el.closest("form")?.requestSubmit();
}

function Check({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-full border text-[10px] leading-none",
        on ? "border-accent bg-accent text-accent-contrast" : "border-border",
      )}
    >
      {on ? "✓" : ""}
    </span>
  );
}

function pillClasses(selected: boolean, variant: "pill" | "card") {
  return cn(
    "flex items-center gap-2 border text-left text-sm transition-[background-color,border-color] duration-micro ease-out-quick",
    variant === "pill" ? "min-h-9 rounded-full px-3.5 py-1.5" : "w-full flex-col items-stretch gap-2 rounded-[var(--radius-card)] p-3",
    selected ? "border-accent bg-bg font-medium" : "border-border bg-surface hover:bg-bg",
  );
}

function PillBody<V extends string>({ option, selected, variant }: { option: PillOption<V>; selected: boolean; variant: "pill" | "card" }) {
  if (variant === "card") {
    return (
      <>
        {option.preview}
        <span className="flex items-center gap-2">
          <Check on={selected} />
          <span className="font-medium">{option.label}</span>
        </span>
        {option.hint ? <span className="text-xs font-normal text-muted">{option.hint}</span> : null}
      </>
    );
  }
  return (
    <>
      <Check on={selected} />
      {option.icon ? <span aria-hidden>{option.icon}</span> : null}
      <span>{option.label}</span>
    </>
  );
}

/** Exactly one of `options` (or none yet): role="radiogroup" with a roving tab stop. */
export function SinglePills<V extends string>({
  options,
  value,
  onChange,
  labelledBy,
  describedBy,
  variant = "pill",
  className,
}: Common<V> & { value: V | null; onChange: (v: V) => void }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = options.findIndex((o) => o.value === value);
  const tabStop = current >= 0 ? current : 0;

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = NEXT_KEYS[e.key];
    let target: number | null = null;
    if (step) target = (i + step + options.length) % options.length;
    else if (e.key === "Home") target = 0;
    else if (e.key === "End") target = options.length - 1;
    else if (e.key === "Enter") {
      e.preventDefault();
      submitForm(e.currentTarget);
      return;
    }
    if (target === null) return;
    e.preventDefault();
    onChange(options[target]!.value);
    refs.current[target]?.focus();
  };

  return (
    <div role="radiogroup" aria-labelledby={labelledBy} aria-describedby={describedBy} className={cn("flex flex-wrap gap-2", className)}>
      {options.map((o, i) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={i === tabStop ? 0 : -1}
            data-pill={o.value}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={pillClasses(selected, variant)}
          >
            <PillBody option={o} selected={selected} variant={variant} />
          </button>
        );
      })}
    </div>
  );
}

/** Any number of `options`: role="group" of toggle buttons (aria-pressed) with a roving tab stop. */
export function MultiPills<V extends string>({
  options,
  value,
  onChange,
  labelledBy,
  describedBy,
  variant = "pill",
  className,
}: Common<V> & { value: readonly V[]; onChange: (v: V[]) => void }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const [focus, setFocus] = useState(0);

  const toggle = (v: V) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = NEXT_KEYS[e.key];
    let target: number | null = null;
    if (step) target = (i + step + options.length) % options.length;
    else if (e.key === "Home") target = 0;
    else if (e.key === "End") target = options.length - 1;
    else if (e.key === "Enter") {
      e.preventDefault();
      submitForm(e.currentTarget);
      return;
    }
    if (target === null) return;
    e.preventDefault();
    setFocus(target);
    refs.current[target]?.focus();
  };

  return (
    <div role="group" aria-labelledby={labelledBy} aria-describedby={describedBy} className={cn("flex flex-wrap gap-2", className)}>
      {options.map((o, i) => {
        const selected = value.includes(o.value);
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            aria-pressed={selected}
            tabIndex={i === focus ? 0 : -1}
            data-pill={o.value}
            onFocus={() => setFocus(i)}
            onClick={() => toggle(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={pillClasses(selected, variant)}
          >
            <PillBody option={o} selected={selected} variant={variant} />
          </button>
        );
      })}
    </div>
  );
}
