"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/client";
import { Close } from "./icons";

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Visually hide the title (still the accessible name). */
  hideTitle?: boolean;
  children: ReactNode;
  /** "center" = modal, "right" = slide-over (560px), "left" = mobile drawer. */
  placement?: "center" | "right" | "left";
  className?: string;
};

/**
 * Native <dialog>: focus trap, inert background, Esc and focus return come from the
 * browser. Clicking the backdrop closes it as well.
 */
export function Dialog({ open, onClose, title, hideTitle, children, placement = "center", className }: DialogProps) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn(
        "m-0 max-h-dvh border-border bg-surface p-0 text-text shadow-float backdrop:bg-black/30",
        placement === "center" && "top-[12vh] mx-auto w-[min(28rem,calc(100vw-2rem))] rounded-[var(--radius-card)] border",
        placement === "right" && "top-0 right-0 left-auto h-dvh w-[min(560px,100vw)] max-w-none border-l",
        placement === "left" && "top-0 left-0 h-dvh w-[min(280px,85vw)] max-w-none border-r",
        className,
      )}
    >
      {open ? (
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-2 px-4 pt-4">
            <h2 id={titleId} className={cn("font-semibold", hideTitle && "sr-only")}>
              {title}
            </h2>
            <button type="button" onClick={onClose} aria-label={t.common.close} className="ml-auto rounded-[var(--radius-badge)] p-1 text-muted hover:bg-bg hover:text-text">
              <Close />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        </div>
      ) : null}
    </dialog>
  );
}

/** Ticket details open here in Sprint 3 (KONZEPT §2.4). */
export function SlideOver(props: Omit<DialogProps, "placement">) {
  return <Dialog {...props} placement="right" />;
}
