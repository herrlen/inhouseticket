import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { PaletteColor } from "@/lib/palette";

export type Priority = "urgent" | "high" | "medium" | "low" | "none";
export type StatusTone = "open" | "active" | "review" | "done";

// Full class strings so Tailwind can see them. Base color = dot, -ink = text (AA).
const palette: Record<PaletteColor, { dot: string; text: string }> = {
  coral: { dot: "bg-p-coral", text: "text-p-coral-ink" },
  orange: { dot: "bg-p-orange", text: "text-p-orange-ink" },
  sun: { dot: "bg-p-sun", text: "text-p-sun-ink" },
  lime: { dot: "bg-p-lime", text: "text-p-lime-ink" },
  mint: { dot: "bg-p-mint", text: "text-p-mint-ink" },
  turquoise: { dot: "bg-p-turquoise", text: "text-p-turquoise-ink" },
  blue: { dot: "bg-p-blue", text: "text-p-blue-ink" },
  indigo: { dot: "bg-p-indigo", text: "text-p-indigo-ink" },
  violet: { dot: "bg-p-violet", text: "text-p-violet-ink" },
  pink: { dot: "bg-p-pink", text: "text-p-pink-ink" },
  berry: { dot: "bg-p-berry", text: "text-p-berry-ink" },
  slate: { dot: "bg-p-slate", text: "text-p-slate-ink" },
};

const priority: Record<Priority, { dot: string; text: string }> = {
  urgent: { dot: "bg-prio-urgent", text: "text-prio-urgent-ink" },
  high: { dot: "bg-prio-high", text: "text-prio-high-ink" },
  medium: { dot: "bg-prio-medium", text: "text-prio-medium-ink" },
  low: { dot: "bg-prio-low", text: "text-prio-low-ink" },
  none: { dot: "bg-prio-none", text: "text-prio-none-ink" },
};

const status: Record<StatusTone, { dot: string; text: string }> = {
  open: { dot: "bg-status-open", text: "text-status-open-ink" },
  active: { dot: "bg-status-active", text: "text-status-active-ink" },
  review: { dot: "bg-status-review", text: "text-status-review-ink" },
  done: { dot: "bg-status-done", text: "text-status-done-ink" },
};

type Tone =
  | { kind: "neutral" }
  | { kind: "palette"; color: PaletteColor }
  | { kind: "priority"; value: Priority }
  | { kind: "status"; value: StatusTone };

function toneClasses(tone: Tone) {
  switch (tone.kind) {
    case "neutral":
      return { dot: "bg-muted", text: "text-muted" };
    case "palette":
      return palette[tone.color];
    case "priority":
      return priority[tone.value];
    case "status":
      return status[tone.value];
  }
}

export type BadgeProps = {
  tone?: Tone;
  /** Status badges render as pills (KONZEPT §5.3). */
  pill?: boolean;
  dot?: boolean;
  children: ReactNode;
  className?: string;
};

/** Text always carries the meaning; color is an additional cue only. */
export function Badge({ tone = { kind: "neutral" }, pill, dot = true, children, className }: BadgeProps) {
  const c = toneClasses(tone);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border border-border bg-surface px-2 py-0.5 text-xs font-medium",
        pill ? "rounded-full" : "rounded-[var(--radius-badge)]",
        c.text,
        className,
      )}
    >
      {dot ? <span aria-hidden className={cn("size-2 shrink-0 rounded-full", c.dot)} /> : null}
      {children}
    </span>
  );
}
