"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type DropdownItem = {
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  danger?: boolean;
};

export type DropdownProps = {
  /** Content of the trigger button. */
  trigger: ReactNode;
  /** Accessible name when the trigger has no visible text (e.g. an icon). */
  triggerLabel?: string;
  items: DropdownItem[];
  align?: "start" | "end";
  className?: string;
  /** Replaces the default bordered trigger style (e.g. for icon-only triggers). */
  triggerClassName?: string;
};

/** Menu button (WAI-ARIA APG): Enter/Space/↓ open, ↑/↓/Home/End move, Esc closes, typeahead. */
export function Dropdown({ trigger, triggerLabel, items, align = "start", className, triggerClassName }: DropdownProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const enabled = items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0);

  useEffect(() => {
    if (open) itemRefs.current[active]?.focus();
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function openAt(index: number | undefined) {
    if (index === undefined) return;
    setActive(index);
    setOpen(true);
  }

  function close(returnFocus = true) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function move(delta: 1 | -1) {
    const pos = enabled.indexOf(active);
    const next = enabled[(pos + delta + enabled.length) % enabled.length];
    if (next !== undefined) setActive(next);
  }

  function onTriggerKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openAt(enabled[0]);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      openAt(enabled.at(-1));
    }
  }

  function onMenuKeyDown(e: KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "Home":
        e.preventDefault();
        if (enabled[0] !== undefined) setActive(enabled[0]);
        break;
      case "End":
        e.preventDefault();
        if (enabled.at(-1) !== undefined) setActive(enabled.at(-1)!);
        break;
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "Tab":
        close(false);
        break;
      default:
        if (e.key.length === 1 && /\S/.test(e.key)) {
          const key = e.key.toLowerCase();
          const pos = enabled.indexOf(active);
          const order = [...enabled.slice(pos + 1), ...enabled.slice(0, pos + 1)];
          const match = order.find((i) => items[i]?.label.toLowerCase().startsWith(key));
          if (match !== undefined) setActive(match);
        }
    }
  }

  return (
    <div className={cn("relative inline-block", className)}>
      <button
        ref={triggerRef}
        type="button"
        id={`${id}-trigger`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        aria-label={triggerLabel}
        onClick={() => (open ? close() : openAt(enabled[0]))}
        onKeyDown={onTriggerKeyDown}
        className={
          triggerClassName ??
          "inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-badge)] border border-border bg-surface px-2.5 text-sm hover:bg-bg"
        }
      >
        {trigger}
      </button>
      {open ? (
        <div
          ref={menuRef}
          id={`${id}-menu`}
          role="menu"
          aria-labelledby={`${id}-trigger`}
          onKeyDown={onMenuKeyDown}
          className={cn(
            "absolute z-50 mt-1 min-w-44 rounded-[var(--radius-card)] border border-border bg-surface p-1 shadow-float",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {items.map((item, i) => (
            <button
              key={`${i}-${item.label}`}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={i === active ? 0 : -1}
              aria-disabled={item.disabled || undefined}
              onClick={() => {
                if (item.disabled) return;
                close();
                item.onSelect();
              }}
              onPointerMove={() => !item.disabled && setActive(i)}
              className={cn(
                "flex w-full items-center gap-2 rounded-[var(--radius-badge)] px-2 py-1.5 text-left text-sm",
                "focus-visible:outline-offset-0 focus:bg-bg",
                item.danger ? "text-prio-urgent-ink" : "text-text",
                item.disabled && "opacity-50",
              )}
            >
              {item.icon ? <span aria-hidden>{item.icon}</span> : null}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
