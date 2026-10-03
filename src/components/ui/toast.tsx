"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { de } from "@/lib/i18n/de";

const DEFAULT_DURATION_MS = 5000;

export type ToastOptions = {
  message: string;
  tone?: "info" | "success" | "error";
  /** Optional action, e.g. "Erneut versuchen" or "Rückgängig". */
  action?: { label: string; onClick: () => void };
  /** 0 = stays until dismissed. Errors default to 0. */
  duration?: number;
};

type ToastItem = ToastOptions & { id: number };

const ToastContext = createContext<((options: ToastOptions) => void) | null>(null);

export function useToast() {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error("useToast must be used inside <ToastProvider>");
  return toast;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const toast = useCallback((options: ToastOptions) => {
    const id = nextId.current++;
    setToasts((all) => [...all.slice(-2), { ...options, id }]);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <section
        aria-label={de.common.notifications}
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </section>
    </ToastContext.Provider>
  );
}

const dots = { info: "bg-accent", success: "bg-status-done", error: "bg-prio-urgent" } as const;

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const tone = toast.tone ?? "info";
  const duration = toast.duration ?? (tone === "error" ? 0 : DEFAULT_DURATION_MS);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!duration || paused) return;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [duration, paused, onDismiss]);

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto flex items-start gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-3 text-sm shadow-float"
    >
      <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", dots[tone])} />
      <p className="flex-1">{toast.message}</p>
      {toast.action ? (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick();
            onDismiss();
          }}
          className="font-medium text-accent hover:underline"
        >
          {toast.action.label}
        </button>
      ) : null}
      <button type="button" onClick={onDismiss} aria-label={de.common.close} className="text-muted hover:text-text">
        <span aria-hidden>×</span>
      </button>
    </div>
  );
}
