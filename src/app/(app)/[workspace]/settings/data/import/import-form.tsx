"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import type { ImportPreview } from "@/lib/import/plan";
import { SOURCE_NAMES, type SourceId } from "@/lib/import/source";
import deImport from "@/lib/i18n/de/import";
import dePriority from "@/lib/i18n/de/priority";

const MESSAGES = { import: deImport, priority: dePriority };

type Suggestion = { name: string; key: string; color: string };
type State =
  | { step: "pick" }
  | { step: "preview"; preview: ImportPreview; suggestion: Suggestion }
  | { step: "done"; tickets: number; projectKey: string; url: string };

const PRIORITIES = ["none", "low", "medium", "high", "urgent"] as const;
const card = "rounded-[var(--radius-card)] border border-border bg-surface p-4";
const input = "h-9 rounded-[var(--radius-badge)] border border-border bg-surface px-3 text-sm";

async function send(workspaceId: string, form: FormData, networkError: string): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/w/${workspaceId}/import`, { method: "POST", body: form });
    const body = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: body?.error?.message ?? networkError };
    return { ok: true, data: body };
  } catch {
    return { ok: false, error: networkError };
  }
}

export function ImportForm({ workspaceId }: { workspaceId: string }) {
  const t = useT(MESSAGES);
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<SourceId>("jira");
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<State>({ step: "pick" });
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function payload(mode: "preview" | "import") {
    const form = new FormData();
    form.set("file", file!);
    form.set("source", source);
    form.set("mode", mode);
    return form;
  }

  async function preview(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setPending(true);
    setError(null);
    const r = await send(workspaceId, payload("preview"), t.import.errors.network);
    setPending(false);
    if (!r.ok) return setError(r.error);
    const data = r.data as { preview: ImportPreview; suggestion: Suggestion };
    setName(data.suggestion.name);
    setKey(data.suggestion.key);
    setState({ step: "preview", ...data });
  }

  async function runImport(e: FormEvent) {
    e.preventDefault();
    if (state.step !== "preview") return;
    setPending(true);
    setError(null);
    const form = payload("import");
    form.set("name", name);
    form.set("key", key);
    form.set("color", state.suggestion.color);
    const r = await send(workspaceId, form, t.import.errors.network);
    setPending(false);
    if (!r.ok) return setError(r.error);
    setState({ step: "done", ...(r.data as { tickets: number; projectKey: string; url: string }) });
    router.refresh(); // new project in the sidebar
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

  if (state.step === "done") {
    return (
      <section className={card} aria-live="polite">
        <p className="mb-3 font-medium">{t.import.done(state.tickets, state.projectKey)}</p>
        <div className="flex flex-wrap gap-2">
          <Link href={state.url} className="inline-flex h-9 items-center rounded-[var(--radius-badge)] bg-accent px-3.5 text-sm font-medium text-accent-contrast hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            {t.import.openProject}
          </Link>
          <Button onClick={reset}>{t.import.another}</Button>
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={preview} className={`${card} flex flex-col gap-4`}>
        <div className="flex flex-col gap-1">
          <label htmlFor="import-source" className="text-[13px] font-medium">
            {t.import.sourceLabel}
          </label>
          <select id="import-source" value={source} onChange={(e) => { setSource(e.target.value as SourceId); reset(); }} className={`${input} w-fit px-2`}>
            {(Object.keys(SOURCE_NAMES) as SourceId[]).map((s) => (
              <option key={s} value={s}>
                {t.import.sources[s]}
              </option>
            ))}
          </select>
        </div>
        <p className="text-[13px]">{t.import.howTo[source]}</p>
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
            {pending && state.step === "pick" ? t.import.reading : t.import.previewButton}
          </Button>
        </div>
        {state.step === "pick" ? errorLine : null}
      </form>

      {state.step === "preview" ? (
        <Preview preview={state.preview} tool={SOURCE_NAMES[source]}>
          <form onSubmit={runImport} className="flex flex-col gap-3">
            <h3 className="font-semibold">{t.import.targetTitle}</h3>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex min-w-56 flex-1 flex-col gap-1">
                <label htmlFor="import-name" className="text-[13px] font-medium">
                  {t.import.nameLabel}
                </label>
                <input id="import-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} className={input} />
              </div>
              <div className="flex w-32 flex-col gap-1">
                <label htmlFor="import-key" className="text-[13px] font-medium">
                  {t.import.keyLabel}
                </label>
                <input
                  id="import-key"
                  value={key}
                  onChange={(e) => setKey(e.target.value.toUpperCase())}
                  required
                  maxLength={10}
                  pattern="[A-Z][A-Z0-9]{1,9}"
                  className={`${input} font-mono`}
                />
              </div>
              <Button type="submit" variant="primary" disabled={pending || state.preview.tickets === 0}>
                {pending ? t.import.importing : t.import.importButton(state.preview.tickets)}
              </Button>
            </div>
            {errorLine}
          </form>
        </Preview>
      ) : null}
    </div>
  );
}

function Preview({ preview: p, tool, children }: { preview: ImportPreview; tool: string; children: ReactNode }) {
  const t = useT(MESSAGES);
  const notes = [
    p.projectCount > 1 ? t.import.multipleProjects(p.projectCount) : null,
    p.skipped ? t.import.skipped(p.skipped) : null,
    p.truncatedTitles ? t.import.truncatedTitles(p.truncatedTitles) : null,
    p.truncatedDescriptions ? t.import.truncatedDescriptions(p.truncatedDescriptions) : null,
    p.foldedSubtasks ? t.import.foldedSubtasks(p.foldedSubtasks) : null,
    t.import.noAttachments,
    p.comments ? t.import.commentsAsYou(tool) : null,
    t.import.noNotifications,
  ].filter((n): n is string => n !== null);
  const th = "py-1.5 pr-3 text-left text-[12px] font-medium text-muted";
  const td = "py-1.5 pr-3 align-top";

  return (
    <section aria-labelledby="import-preview-heading" className={`${card} flex flex-col gap-5`}>
      <div>
        <h2 id="import-preview-heading" className="font-semibold">
          {t.import.previewTitle}
        </h2>
        <p className="text-sm">{t.import.summary(p.tickets, p.subtasks, p.comments, p.labels)}</p>
      </div>

      <div className="overflow-x-auto">
        <h3 className="mb-1 text-[13px] font-semibold">{t.import.statusesTitle}</h3>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border">
              <th className={th}>{t.import.statusesFrom}</th>
              <th className={th}>{t.import.statusesTo}</th>
              <th className={`${th} text-right`}>{t.import.count}</th>
            </tr>
          </thead>
          <tbody>
            {p.statuses.map((s) => (
              <tr key={`${s.from}-${s.to}`} className="border-b border-border last:border-0">
                <td className={td}>{s.from}</td>
                <td className={td}>{s.to}</td>
                <td className={`${td} text-right tabular-nums`}>{s.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {p.people.length ? (
        <div className="overflow-x-auto">
          <h3 className="mb-1 text-[13px] font-semibold">{t.import.peopleTitle}</h3>
          <table className="w-full text-[13px]">
            <tbody>
              {p.people.map((person) => (
                <tr key={person.name} className="border-b border-border last:border-0">
                  <td className={td}>{person.name}</td>
                  <td className={`${td} ${person.member ? "" : "text-prio-urgent-ink"}`}>
                    {person.member ? t.import.peopleMatched(person.member) : t.import.peopleUnmatched}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{person.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {p.people.some((x) => !x.member) ? <p className="mt-1 text-[13px] text-muted">{t.import.peopleHint}</p> : null}
        </div>
      ) : null}

      {p.columns ? (
        <div>
          <h3 className="mb-1 text-[13px] font-semibold">{t.import.columnsTitle}</h3>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
            {p.columns.map((c) => (
              <li key={c.field}>
                {t.import.columnFields[c.field]} <span className="text-muted">← {c.column}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[13px] text-muted">{t.import.columnsHint}</p>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <h3 className="mb-1 text-[13px] font-semibold">{t.import.sampleTitle}</h3>
        <ul className="flex flex-col gap-1 text-[13px]">
          {p.sample.map((s) => (
            <li key={`${s.ref}-${s.title}`} className="flex flex-wrap gap-x-2">
              {s.ref ? <span className="font-mono text-muted">{s.ref}</span> : null}
              <span className="min-w-0 flex-1 break-words">{s.title}</span>
              <span className="text-muted">
                {s.status} · {t.priority[PRIORITIES[s.priority] ?? "none"]}
                {s.assignee ? ` · ${s.assignee}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="mb-1 text-[13px] font-semibold">{t.import.notesTitle}</h3>
        <ul className="list-disc pl-5 text-[13px]">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </div>

      {children}
    </section>
  );
}
