"use client";

import { forwardRef, useState } from "react";
import { cn } from "@/lib/cn";
import { de } from "@/lib/i18n/de";
import { MAX_TITLE } from "@/lib/limits";

/** Single-line ticket creation: type, Enter. Counter shows n/500 (KONZEPT §5.5). */
export const QuickAdd = forwardRef<HTMLInputElement, { onCreate: (title: string) => void }>(function QuickAdd({ onCreate }, ref) {
  const [title, setTitle] = useState("");
  const near = title.length > MAX_TITLE * 0.8;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const t = title.trim();
        if (!t) return;
        onCreate(t);
        setTitle("");
      }}
      className="flex items-center gap-2 rounded-[var(--radius-card)] border border-border bg-surface px-3 focus-within:border-accent"
    >
      <span aria-hidden className="text-muted">+</span>
      <label htmlFor="quick-add" className="sr-only">
        {de.list.quickAddLabel}
      </label>
      <input
        ref={ref}
        id="quick-add"
        value={title}
        maxLength={MAX_TITLE}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setTitle("");
            e.currentTarget.blur();
          }
        }}
        placeholder={de.list.quickAddPlaceholder}
        aria-describedby="quick-add-count"
        className="h-10 min-w-0 flex-1 bg-transparent text-sm placeholder:text-muted focus:outline-none"
      />
      <span id="quick-add-count" className={cn("text-xs tabular-nums", near ? "text-prio-high-ink" : "text-muted", !title && "invisible")} aria-live="polite">
        {title.length}/{MAX_TITLE}
      </span>
      <kbd className="hidden rounded border border-border px-1.5 font-mono text-[11px] text-muted sm:inline" aria-hidden>
        C
      </kbd>
    </form>
  );
});
