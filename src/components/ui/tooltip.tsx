"use client";

import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type ReactElement } from "react";
import { cn } from "@/lib/cn";

const SHOW_DELAY_MS = 400;

export type TooltipProps = {
  content: string;
  /** Must be a single focusable element; it receives aria-describedby. */
  children: ReactElement<{ "aria-describedby"?: string }>;
  side?: "top" | "bottom";
};

/** Shows on hover and keyboard focus, hides on leave, blur or Esc (WCAG 1.4.13). */
export function Tooltip({ content, children, side = "top" }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const show = (delay: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };

  if (!isValidElement(children)) return children;

  return (
    <span
      className="relative inline-flex"
      onPointerEnter={() => show(SHOW_DELAY_MS)}
      onPointerLeave={hide}
      onFocus={() => show(0)}
      onBlur={hide}
    >
      {cloneElement(children, { "aria-describedby": id })}
      <span
        id={id}
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 rounded-[var(--radius-badge)] bg-text px-2 py-1 text-xs whitespace-nowrap text-bg shadow-float",
          side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
          open ? "visible" : "invisible",
        )}
      >
        {content}
      </span>
    </span>
  );
}
