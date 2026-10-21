"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import type { AttachmentRow, CommentRow } from "@/db/queries/ticket-parts";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Close, Plus } from "@/components/ui/icons";
import { Markdown } from "@/components/ui/markdown";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { shrinkImage } from "@/lib/compress-image";
import { relativeTime } from "@/lib/relative-time";
import { useLocale, useT } from "@/lib/i18n/client";
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_TICKET, MAX_COMMENT, MAX_DESCRIPTION, MAX_SUBTASKS, MAX_TITLE } from "@/lib/limits";
import { useProjectInfo } from "./context";
import { partsKey, type usePartActions } from "./use-parts";
import { ticketsKey } from "./use-tickets";
import deCommon from "@/lib/i18n/de/common";
import deDetail from "@/lib/i18n/de/detail";
import deExplorer from "@/lib/i18n/de/explorer";

const MESSAGES = { common: deCommon, detail: deDetail, explorer: deExplorer };

type Actions = ReturnType<typeof usePartActions>;

const kb = (bytes: number) => `${Math.round(bytes / 1024)} KB`;

// ---------------------------------------------------------------------------
// Description: rendered Markdown, click to edit
// ---------------------------------------------------------------------------

export function DescriptionField({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const t = useT(MESSAGES);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const commit = () => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span id="desc-label" className="text-[13px] font-medium">{t.detail.description}</span>
        {editing ? <span className={cn("text-xs tabular-nums", draft.length > MAX_DESCRIPTION * 0.9 ? "text-prio-high-ink" : "text-muted")}>{draft.length}/{MAX_DESCRIPTION}</span> : null}
      </div>
      {editing ? (
        <>
          <textarea
            aria-labelledby="desc-label"
            aria-label={t.detail.description}
            autoFocus
            value={draft}
            maxLength={MAX_DESCRIPTION}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                commit();
              }
            }}
            placeholder={t.detail.descriptionPlaceholder}
            className="field-sizing-content min-h-28 resize-y rounded-[var(--radius-badge)] border border-accent bg-surface p-2 text-sm placeholder:text-muted"
          />
          <p className="text-xs text-muted">{t.detail.markdownHint}</p>
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraft(value);
            setEditing(true);
          }}
          aria-label={value ? t.detail.editDescription : t.detail.addDescription}
          className="min-h-12 rounded-[var(--radius-badge)] border border-transparent p-2 text-left hover:border-border"
        >
          {value ? <Markdown source={value} /> : <span className="text-sm text-muted">{t.detail.addDescription}</span>}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subtasks
// ---------------------------------------------------------------------------

export function Subtasks({ subtasks, actions }: { subtasks: Parts["subtasks"]; actions: Actions }) {
  const t = useT(MESSAGES);
  const [title, setTitle] = useState("");
  const full = subtasks.length >= MAX_SUBTASKS;
  const done = subtasks.filter((s) => s.done).length;
  return (
    <section aria-labelledby="subtasks-heading" className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <h3 id="subtasks-heading" className="text-[13px] font-medium">{t.detail.subtasks}</h3>
        <span className="text-xs text-muted tabular-nums" aria-label={t.detail.subtaskProgress(done, subtasks.length)}>
          {done}/{subtasks.length} · {subtasks.length}/{MAX_SUBTASKS}
        </span>
      </div>
      <ul className="flex flex-col">
        {subtasks.map((s) => (
          <SubtaskItem key={s.id} subtask={s} actions={actions} />
        ))}
      </ul>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const t = title.trim();
          if (!t || full) return;
          actions.addSubtask.mutate(t);
          setTitle("");
        }}
      >
        <label htmlFor="new-subtask" className="sr-only">{t.detail.newSubtask}</label>
        <input
          id="new-subtask"
          value={title}
          maxLength={MAX_TITLE}
          disabled={full}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={full ? t.detail.subtasksFull : t.detail.newSubtaskPlaceholder}
          className="h-8 flex-1 rounded-[var(--radius-badge)] border border-border bg-surface px-2 text-[13px] placeholder:text-muted disabled:opacity-60"
        />
        <Button type="submit" size="sm" disabled={full || !title.trim()} aria-label={t.detail.newSubtask}>
          <Plus size={14} />
        </Button>
      </form>
    </section>
  );
}

type Parts = import("./use-parts").Parts;

function SubtaskItem({ subtask, actions }: { subtask: Parts["subtasks"][number]; actions: Actions }) {
  const t = useT(MESSAGES);
  const [title, setTitle] = useState(subtask.title);
  // Local echo so the checkbox flips instantly; resyncs when the server state changes.
  const [done, setDone] = useState(subtask.done);
  const [serverDone, setServerDone] = useState(subtask.done);
  if (subtask.done !== serverDone) {
    setServerDone(subtask.done);
    setDone(subtask.done);
  }
  const id = useId();
  return (
    <li className="group flex items-center gap-2 rounded-[var(--radius-badge)] px-1 hover:bg-bg">
      <input
        id={id}
        type="checkbox"
        checked={done}
        onChange={(e) => {
          setDone(e.target.checked);
          actions.toggleSubtask.mutate({ id: subtask.id, done: e.target.checked });
        }}
        aria-label={t.detail.subtaskDone(subtask.title)}
        className="size-4 accent-[var(--accent)]"
      />
      <input
        value={title}
        maxLength={MAX_TITLE}
        aria-label={t.detail.subtaskTitle}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => {
          const t = title.trim();
          if (t && t !== subtask.title) actions.renameSubtask.mutate({ id: subtask.id, title: t });
          else setTitle(subtask.title);
        }}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className={cn("h-8 min-w-0 flex-1 bg-transparent text-[13px]", done && "text-muted line-through")}
      />
      <button
        type="button"
        onClick={() => actions.removeSubtask.mutate(subtask.id)}
        aria-label={t.detail.removeSubtask(subtask.title)}
        className="rounded p-1 text-muted opacity-0 group-hover:opacity-100 hover:text-text focus-visible:opacity-100"
      >
        <Close size={12} />
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export function Attachments({ workspaceId, ticketId, attachments, manageAll, actions }: { workspaceId: string; ticketId: string; attachments: AttachmentRow[]; manageAll: boolean; actions: Actions }) {
  const t = useT(MESSAGES);
  const { currentUserId } = useProjectInfo();
  const { project } = useProjectInfo();
  const qc = useQueryClient();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<AttachmentRow | null>(null);
  const full = attachments.length >= MAX_ATTACHMENTS_PER_TICKET;

  async function upload(files: File[]) {
    for (const original of files) {
      if (attachments.length >= MAX_ATTACHMENTS_PER_TICKET) break;
      setBusy(original.size > MAX_ATTACHMENT_BYTES ? t.detail.shrinking(original.name) : t.detail.uploading(original.name));
      const file = await shrinkImage(original, MAX_ATTACHMENT_BYTES);
      if (!file) {
        toast({ message: t.detail.cannotShrink(original.name), tone: "error" });
        continue;
      }
      setBusy(t.detail.uploading(file.name));
      const body = new FormData();
      body.set("file", file);
      const res = await fetch(`/api/w/${workspaceId}/tickets/${ticketId}/attachments`, { method: "POST", body });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        toast({ message: err?.error?.message ?? t.explorer.saveFailed, tone: "error" });
      }
    }
    setBusy(null);
    void qc.invalidateQueries({ queryKey: partsKey(ticketId) });
    void qc.invalidateQueries({ queryKey: ticketsKey(project.id) });
  }

  return (
    <section
      aria-labelledby="attachments-heading"
      className={cn("flex flex-col gap-2 rounded-[var(--radius-badge)]", dragOver && "ring-2 ring-accent")}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        void upload([...e.dataTransfer.files]);
      }}
    >
      <div className="flex items-center justify-between">
        <h3 id="attachments-heading" className="text-[13px] font-medium">{t.detail.attachments}</h3>
        <span className="text-xs text-muted tabular-nums">{attachments.length}/{MAX_ATTACHMENTS_PER_TICKET}</span>
      </div>
      {attachments.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2">
          {attachments.map((a) => (
            <li key={a.id} className="group relative">
              <button type="button" onClick={() => setPreview(a)} aria-label={t.detail.openImage(a.fileName)} className="block w-full overflow-hidden rounded-[var(--radius-badge)] border border-border bg-bg">
                {/* eslint-disable-next-line @next/next/no-img-element -- member-only API route, no optimizer */}
                <img src={`/api/w/${workspaceId}/attachments/${a.key}`} alt={a.fileName} loading="lazy" width={a.width} height={a.height} className="aspect-square w-full object-cover" />
              </button>
              {manageAll || a.uploadedBy === currentUserId ? (
              <button
                type="button"
                onClick={() => actions.removeAttachment.mutate(a.id)}
                aria-label={t.detail.removeAttachment(a.fileName)}
                className="absolute top-1 right-1 rounded-full bg-surface/90 p-1 text-muted opacity-0 shadow-float group-hover:opacity-100 hover:text-text focus-visible:opacity-100"
              >
                <Close size={12} />
              </button>
              ) : null}
              <p className="mt-0.5 truncate text-[11px] text-muted" title={a.fileName}>{a.fileName} · {kb(a.bytes)}</p>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex items-center gap-2">
        <input
          ref={input}
          type="file"
          accept="image/webp,image/jpeg,image/png"
          multiple
          className="sr-only"
          id={`upload-${ticketId}`}
          onChange={(e) => {
            void upload([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
        <Button size="sm" disabled={full || Boolean(busy)} onClick={() => input.current?.click()}>
          <Plus size={14} /> {t.detail.addImage}
        </Button>
        <span className="text-xs text-muted" aria-live="polite">{busy ?? t.detail.imageHint}</span>
      </div>
      <Dialog open={Boolean(preview)} onClose={() => setPreview(null)} title={preview?.fileName ?? ""} className="w-[min(64rem,calc(100vw-2rem))]">
        {preview ? (
          <figure className="flex flex-col items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- member-only API route */}
            <img src={`/api/w/${workspaceId}/attachments/${preview.key}`} alt={preview.fileName} className="max-h-[70vh] w-auto rounded-[var(--radius-badge)]" />
            <figcaption className="text-xs text-muted">{preview.width}×{preview.height} · {kb(preview.bytes)}</figcaption>
          </figure>
        ) : null}
      </Dialog>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Comments with @mentions
// ---------------------------------------------------------------------------

export function Comments({ comments, actions }: { comments: CommentRow[]; actions: Actions }) {
  const t = useT(MESSAGES);
  const { currentUserId } = useProjectInfo();
  return (
    <div className="flex flex-col gap-4">
      {comments.length === 0 ? <p className="text-xs text-muted">{t.detail.noComments}</p> : null}
      <ol className="flex flex-col gap-4">
        {comments.map((c) => (
          <CommentItem key={c.id} comment={c} mine={c.authorId === currentUserId} actions={actions} />
        ))}
      </ol>
      <CommentComposer onSubmit={(body) => actions.addComment.mutate(body)} pending={actions.addComment.isPending} />
    </div>
  );
}

function CommentItem({ comment, mine, actions }: { comment: CommentRow; mine: boolean; actions: Actions }) {
  const t = useT(MESSAGES);
  const locale = useLocale();
  const [editing, setEditing] = useState(false);
  return (
    <li className="flex gap-2">
      <Avatar user={{ id: comment.authorId, name: comment.authorName, image: comment.authorImage }} size="sm" className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-xs">
          <span className="font-medium">{comment.authorName}</span>{" "}
          <span className="text-muted">
            · <time dateTime={comment.createdAt}>{relativeTime(comment.createdAt, undefined, locale)}</time>
            {comment.editedAt ? ` · ${t.detail.edited}` : ""}
          </span>
        </p>
        {editing ? (
          <CommentComposer
            initial={comment.body}
            submitLabel={t.common.save}
            onCancel={() => setEditing(false)}
            onSubmit={(body) => {
              actions.editComment.mutate({ id: comment.id, body });
              setEditing(false);
            }}
          />
        ) : (
          <Markdown source={comment.body} className="mt-0.5" />
        )}
        {mine && !editing ? (
          <div className="mt-1 flex gap-3 text-xs text-muted">
            <button type="button" className="hover:text-text hover:underline" onClick={() => setEditing(true)}>{t.detail.edit}</button>
            <button type="button" className="hover:text-text hover:underline" onClick={() => actions.removeComment.mutate(comment.id)}>{t.common.delete}</button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

/** Textarea with @-autocomplete; mentions are stored as @[Name](userId). */
export function CommentComposer({
  onSubmit,
  pending,
  initial = "",
  submitLabel,
  onCancel,
}: {
  onSubmit: (body: string) => void;
  pending?: boolean;
  initial?: string;
  submitLabel?: string;
  onCancel?: () => void;
}) {
  const t = useT(MESSAGES);
  const { members } = useProjectInfo();
  const [body, setBody] = useState(initial);
  const [query, setQuery] = useState<{ start: number; text: string } | null>(null);
  const [active, setActive] = useState(0);
  const area = useRef<HTMLTextAreaElement>(null);
  const listId = useId();
  // Caret position to restore right after the next commit – before further key presses are handled.
  const pendingCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (pendingCaret.current === null || !area.current) return;
    area.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  }, [body]);

  const matches = query ? members.filter((m) => m.name.toLowerCase().includes(query.text.toLowerCase())).slice(0, 6) : [];
  const open = Boolean(query) && matches.length > 0;

  function detect(value: string, caret: number) {
    const before = value.slice(0, caret);
    const m = before.match(/(^|\s)@([\p{L}\p{N}._-]{0,30})$/u);
    setQuery(m ? { start: caret - m[2]!.length - 1, text: m[2]! } : null);
    setActive(0);
  }

  function insert(member: { id: string; name: string }) {
    if (!query) return;
    const caret = area.current?.selectionStart ?? body.length;
    const token = `@[${member.name}](${member.id}) `;
    const next = body.slice(0, query.start) + token + body.slice(caret);
    pendingCaret.current = query.start + token.length;
    setBody(next);
    setQuery(null);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => (a + (e.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insert(matches[active]!);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setQuery(null);
        return;
      }
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
    if (e.key === "Escape" && onCancel) {
      e.stopPropagation();
      onCancel();
    }
  }

  function submit() {
    const t = body.trim();
    if (!t) return;
    onSubmit(t);
    if (!initial) setBody("");
  }

  return (
    <div className="relative flex flex-col gap-1">
      <label htmlFor={`${listId}-input`} className="sr-only">{t.detail.commentLabel}</label>
      <textarea
        ref={area}
        id={`${listId}-input`}
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        value={body}
        maxLength={MAX_COMMENT}
        rows={2}
        placeholder={t.detail.commentPlaceholder}
        onChange={(e) => {
          setBody(e.target.value);
          detect(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        className="field-sizing-content min-h-16 resize-y rounded-[var(--radius-badge)] border border-border bg-surface p-2 text-sm placeholder:text-muted"
      />
      {open ? (
        <ul id={listId} role="listbox" aria-label={t.detail.mentionList} className="absolute top-full left-0 z-20 mt-1 w-64 rounded-[var(--radius-card)] border border-border bg-surface p-1 shadow-float">
          {matches.map((m, i) => (
            <li
              key={m.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                insert(m);
              }}
              className={cn("flex cursor-pointer items-center gap-2 rounded-[var(--radius-badge)] px-2 py-1.5 text-[13px]", i === active && "bg-bg")}
            >
              <Avatar user={m} size="sm" />
              {m.name}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted">{t.detail.commentHint}</span>
        <div className="flex gap-2">
          {onCancel ? <Button size="sm" variant="ghost" onClick={onCancel}>{t.common.cancel}</Button> : null}
          <Button size="sm" variant="primary" disabled={pending || !body.trim()} onClick={submit}>
            {submitLabel ?? t.detail.send}
          </Button>
        </div>
      </div>
    </div>
  );
}
