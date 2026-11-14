"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import deImport from "@/lib/i18n/de/import";

const MESSAGES = { import: deImport };

/** A CSV run as the progress route returns it (dates as ISO strings). */
export type RunView = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  counts: Record<string, number>;
  done: number;
  total: number;
  running: boolean;
};

const card = "rounded-[var(--radius-card)] border border-border bg-surface p-4";

/** Progress while the import runs, the result once it is through. */
export function ClickUpRunView({ run, slug, onAnother }: { run: RunView | null; slug: string; onAnother: () => void }) {
  const t = useT(MESSAGES);
  const c = t.import.clickup;
  const n = (k: string) => run?.counts[k] ?? 0;

  if (!run?.finishedAt) {
    const total = Math.max(run?.total ?? 0, 1);
    const done = Math.min(run?.done ?? 0, total);
    const linking = Boolean(run && run.total > 0 && run.done >= run.total);
    return (
      <section className={`${card} flex flex-col gap-3`} aria-labelledby="import-run-heading">
        <h2 id="import-run-heading" className="font-semibold">
          {c.runningTitle}
        </h2>
        <progress value={done} max={total} aria-label={c.progressLabel} className="h-2 w-full accent-[var(--accent)]" />
        <p className="text-[13px]" aria-live="polite">
          {!run ? c.waiting : linking ? c.linking : c.progress(done, run.total)}
          {run && n("created") ? ` · ${c.result.created(n("created"))}` : ""}
        </p>
        <p className="text-[13px] text-muted">{c.runningHint}</p>
      </section>
    );
  }

  const lines = [
    c.result.created(n("created")),
    n("unchanged") ? c.result.unchanged(n("unchanged")) : null,
    n("comments") ? c.result.comments(n("comments")) : null,
    n("duplicates") ? c.result.duplicates(n("duplicates")) : null,
    n("skipped") ? c.result.skipped(n("skipped")) : null,
    n("unlinked") ? c.result.unlinked(n("unlinked")) : null,
    n("errors") ? c.result.errors(n("errors")) : null,
  ].filter((l): l is string => l !== null);

  return (
    <section className={`${card} flex flex-col gap-3`} aria-live="polite" aria-labelledby="import-run-heading">
      <h2 id="import-run-heading" className={`font-semibold ${run.error ? "text-prio-urgent-ink" : ""}`}>
        {run.error ? c.failedTitle : c.doneTitle}
      </h2>
      {run.error ? <p className="text-[13px]">{c.failed}</p> : null}
      <ul className="list-disc pl-5 text-[13px]">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Link href={`/${slug}`} className="inline-flex h-9 items-center rounded-[var(--radius-badge)] bg-accent px-3.5 text-sm font-medium text-accent-contrast hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          {c.toProjects}
        </Link>
        <Button onClick={onAnother}>{c.another}</Button>
      </div>
    </section>
  );
}
