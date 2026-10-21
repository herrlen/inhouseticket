"use client";

import { useId, useState, type ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/client";
import deInput from "@/lib/i18n/de/input";

const MESSAGES = { input: deInput };

export type InputProps = Omit<ComponentProps<"input">, "id"> & {
  label: string;
  /** Visually hide the label (it stays available to screen readers). */
  hideLabel?: boolean;
  hint?: string;
  error?: string;
  /** Shows a live counter "n/max" when maxLength is set (KONZEPT §5.5). */
  showCounter?: boolean;
  /** Extra classes for the <input> itself (className styles the wrapper). */
  inputClassName?: string;
};

export function Input({ label, hideLabel, hint, error, showCounter, maxLength, className, inputClassName, onChange, ...props }: InputProps) {
  const t = useT(MESSAGES);
  const id = useId();
  const initial = String(props.value ?? props.defaultValue ?? "");
  const [count, setCount] = useState(initial.length);
  const described = [hint && `${id}-hint`, error && `${id}-error`, showCounter && maxLength && `${id}-count`]
    .filter(Boolean)
    .join(" ");
  const current = props.value !== undefined ? String(props.value).length : count;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={id} className={cn("text-[13px] font-medium", hideLabel && "sr-only")}>
        {label}
      </label>
      <input
        id={id}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={described || undefined}
        onChange={(e) => {
          setCount(e.target.value.length);
          onChange?.(e);
        }}
        className={cn(
          "h-9 rounded-[var(--radius-badge)] border bg-surface px-3 text-sm text-text placeholder:text-muted",
          error ? "border-prio-urgent-ink" : "border-border",
          inputClassName,
        )}
        {...props}
      />
      <div className="flex justify-between gap-2 text-xs">
        <span>
          {error ? (
            <span id={`${id}-error`} className="text-prio-urgent-ink">
              {error}
            </span>
          ) : hint ? (
            <span id={`${id}-hint`} className="text-muted">
              {hint}
            </span>
          ) : null}
        </span>
        {showCounter && maxLength ? (
          <span id={`${id}-count`} className="text-muted tabular-nums" aria-label={t.input.counter(current, maxLength)}>
            {current}/{maxLength}
          </span>
        ) : null}
      </div>
    </div>
  );
}
