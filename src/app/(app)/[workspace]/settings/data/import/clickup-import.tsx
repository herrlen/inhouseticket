"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import deImport from "@/lib/i18n/de/import";
import type { ClickUpPreview } from "@/lib/import/clickup-plan";
import type { StatusTarget } from "@/lib/integrations/mapping";
import { ClickUpPreviewView } from "./clickup-preview";
import { ClickUpRunView, type RunView } from "./clickup-run";

const MESSAGES = { import: deImport };
const POLL_MS = 1500;

type State =
  | { step: "pick" }
  | { step: "preview"; uploadId: string; preview: ClickUpPreview }
  | { step: "run"; runId: string; run: RunView | null };

const card = "rounded-[var(--radius-card)] border border-border bg-surface p-4";

async function call(url: string, init: RequestInit, fallback: string): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, init);
    const body = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: body?.error?.message ?? fallback };
    return { ok: true, data: body };
  } catch {
    return { ok: false, error: fallback };
  }
}

/**
 * ClickUp workspace export: upload → preview with editable status mapping → background import
 * with progress. `initialRun` is a run that is still going (or just finished) when the page opens.
 */
export function ClickUpImport({ workspaceId, slug, initialRun, header }: { workspaceId: string; slug: string; initialRun: RunView | null; header: ReactNode }) {
  const t = useT(MESSAGES);
  const c = t.import.clickup;
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<State>(initialRun ? { step: "run", runId: initialRun.id, run: initialRun } : { step: "pick" });
  const [targets, setTargets] = useState<Record<string, StatusTarget>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const runId = state.step === "run" ? state.runId : null;
  const finished = state.step === "run" && Boolean(state.run?.finishedAt);

  // Polls the run until it is through; the import itself runs on the server either way.
  useEffect(() => {
    if (!runId || finished) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const r = await call(`/api/w/${workspaceId}/import/runs/${runId}`, { cache: "no-store" }, c.errors.status);
      if (stop) return;
      if (!r.ok) setError(r.error);
      else {
        setError(null);
        const run = (r.data as { run: RunView }).run;
        setState({ step: "run", runId, run });
        if (run.finishedAt) {
          router.refresh(); // new projects in the sidebar
          return;
        }
      }
      timer = setTimeout(tick, POLL_MS);
    };
    timer = setTimeout(tick, initialRun?.id === runId ? 0 : POLL_MS);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [runId, finished, workspaceId, router, c.errors.status, initialRun?.id]);

  async function upload(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setPending(true);
    setError(null);
    const r = await call(
      `/api/w/${workspaceId}/import/clickup`,
      { method: "POST", body: file, headers: { "content-type": "text/csv", "x-file-name": encodeURIComponent(file.name) } },
      t.import.errors.network,
    );
    setPending(false);
    if (!r.ok) return setError(r.error);
    const data = r.data as { uploadId: string; preview: ClickUpPreview };
    setTargets(Object.fromEntries(data.preview.statuses.map((s) => [s.name, s.target])));
    setState({ step: "preview", ...data });
  }

  async function start() {
    if (state.step !== "preview") return;
    setPending(true);
    setError(null);
    const statuses = state.preview.statuses.map((s) => ({ name: s.name, target: targets[s.name] ?? s.target }));
    const r = await call(
      `/api/w/${workspaceId}/import/clickup/${state.uploadId}`,
      { method: "POST", body: JSON.stringify({ statuses }), headers: { "content-type": "application/json" } },
      t.import.errors.network,
    );
    setPending(false);
    if (!r.ok) return setError(r.error);
    setState({ step: "run", runId: (r.data as { runId: string }).runId, run: null });
  }

  function reset() {
    setState({ step: "pick" });
    setFile(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  const errorLine = error ? (
    <p role="alert" className="text-[13px] text-prio-urgent-ink">
      {error}
    </p>
  ) : null;

  if (state.step === "run") {
    return (
      <div className="flex flex-col gap-6">
        <div className={`${card} flex flex-col gap-4`}>{header}</div>
        <ClickUpRunView run={state.run} slug={slug} onAnother={reset} />
        {errorLine}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={upload} className={`${card} flex flex-col gap-4`}>
        {header}
        <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-56 flex-1 flex-col gap-1">
          <label htmlFor="import-file" className="text-[13px] font-medium">
            {t.import.fileLabel}
          </label>
          <input
            ref={fileRef}
            id="import-file"
            type="file"
            accept=".csv,text/csv"
            required
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setState({ step: "pick" });
              setError(null);
            }}
            className="text-sm file:mr-3 file:h-9 file:rounded-[var(--radius-badge)] file:border file:border-border file:bg-surface file:px-3 file:text-[13px] file:font-medium"
          />
        </div>
        <Button type="submit" variant={state.step === "pick" ? "primary" : "secondary"} disabled={!file || pending}>
          {pending && state.step === "pick" ? c.uploading : t.import.previewButton}
        </Button>
        </div>
        {state.step === "pick" ? errorLine : null}
      </form>

      {state.step === "preview" ? (
        <section aria-labelledby="import-preview-heading" className={`${card} flex flex-col gap-5`}>
          <ClickUpPreviewView preview={state.preview} targets={targets} onTarget={(name, target) => setTargets((cur) => ({ ...cur, [name]: target }))} />
          <div className="flex flex-col gap-2">
            <div>
              <Button variant="primary" onClick={start} disabled={pending || state.preview.tasks === state.preview.known}>
                {pending ? c.starting : c.startButton(state.preview.tasks - state.preview.known)}
              </Button>
            </div>
            {errorLine}
          </div>
        </section>
      ) : null}
    </div>
  );
}
