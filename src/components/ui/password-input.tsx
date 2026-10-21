"use client";

import { useId, useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/client";
import dePassword from "@/lib/i18n/de/password";

const MESSAGES = { password: dePassword };

export type PasswordInputProps = Omit<ComponentProps<"input">, "id" | "type"> & {
  label: string;
  /** "new-password" for a new one (password managers suggest one), "current-password" to sign in. */
  autoComplete: "new-password" | "current-password";
  hint?: string;
  error?: string;
};

/** Password field with a show/hide toggle; the toggle is a real button, reachable by keyboard. */
export function PasswordInput({ label, hint, error, className, ...props }: PasswordInputProps) {
  const t = useT(MESSAGES);
  const id = useId();
  const [visible, setVisible] = useState(false);
  const described = [hint && !error && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ");

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={id} className="text-[13px] font-medium">
        {label}
      </label>
      <div
        className={cn(
          "flex h-9 items-center gap-1 rounded-[var(--radius-badge)] border bg-surface",
          error ? "border-prio-urgent-ink" : "border-border",
        )}
      >
        <input
          id={id}
          type={visible ? "text" : "password"}
          spellCheck={false}
          autoCapitalize="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={described || undefined}
          className="h-full min-w-0 flex-1 rounded-[var(--radius-badge)] bg-transparent px-3 text-sm text-text placeholder:text-muted"
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? t.password.hide : t.password.show}
          aria-pressed={visible}
          aria-controls={id}
          className="mr-1 flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-badge)] text-muted hover:bg-bg hover:text-text"
        >
          {visible ? <EyeOff /> : <Eye />}
        </button>
      </div>
      {error ? (
        <span id={`${id}-error`} className="text-xs text-prio-urgent-ink">
          {error}
        </span>
      ) : hint ? (
        <span id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
