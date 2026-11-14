"use client";

import { forwardRef, useState } from "react";
import { Plus } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { useLocale, useT } from "@/lib/i18n/client";
import { MAX_TITLE } from "@/lib/limits";
import { parseQuickAdd, type QuickAddResult } from "@/lib/quick-add";
import { useProjectInfo } from "./context";
import { todayInBerlin } from "./list-model";
import deList from "@/lib/i18n/de/list";
import deQuickAdd from "@/lib/i18n/de/quickAdd";

const MESSAGES = { list: deList, quickAdd: deQuickAdd };

/** Single-line ticket creation with @person !prio ^date. Counter n/500 (KONZEPT §5.5). */
export const QuickAdd = forwardRef<HTMLInputElement, { onCreate: (ticket: QuickAddResult) => void }>(function QuickAdd({ onCreate }, ref) {
  const t = useT(MESSAGES);
  const locale = useLocale();
  const { members, currentUserId } = useProjectInfo();
  const [text, setText] = useState("");
  const parsed = parseQuickAdd(text, { members, today: todayInBerlin(), currentUserId, locale });
  const near = text.length > MAX_TITLE * 0.8;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!parsed.title.trim()) return;
        onCreate(parsed);
        setText("");
      }}
      className="flex flex-col gap-1"
    >
      <div className="flex items-center gap-2 rounded-[var(--radius-field)] border border-border bg-content px-3 hover:border-muted/60 focus-within:border-accent focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus)]">
        <Plus className="shrink-0 text-muted" />
        <label htmlFor="quick-add" className="sr-only">{t.list.quickAddLabel}</label>
        <input
          ref={ref}
          id="quick-add"
          value={text}
          maxLength={MAX_TITLE}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setText("");
              e.currentTarget.blur();
            }
          }}
          placeholder={t.list.quickAddPlaceholder}
          aria-describedby="quick-add-count quick-add-help"
          className="h-10 min-w-0 flex-1 bg-transparent text-sm placeholder:text-muted focus:outline-none"
        />
        <span id="quick-add-count" className={cn("text-xs tabular-nums", near ? "text-prio-high-ink" : "text-muted", !text && "invisible")} aria-live="polite">
          {text.length}/{MAX_TITLE}
        </span>
        <kbd className="hidden rounded border border-border-subtle bg-hover px-1.5 font-mono text-[11px] text-muted sm:inline" aria-hidden>C</kbd>
      </div>
      <p id="quick-add-help" className="flex min-h-5 flex-wrap items-center gap-1.5 px-1 text-xs text-muted" aria-live="polite">
        {parsed.tokens.length > 0 ? (
          parsed.tokens.map((tok) => (
            <span key={tok.kind} className="rounded-[var(--radius-badge)] bg-accent-soft px-2 py-0.5 font-medium text-accent-strong">
              {t.quickAdd[tok.kind]}: {tok.label}
            </span>
          ))
        ) : text ? null : (
          <span>{t.quickAdd.hint}</span>
        )}
      </p>
    </form>
  );
});
