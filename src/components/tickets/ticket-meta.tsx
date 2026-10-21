"use client";

import { CheckSquare, CommentIcon, Paperclip } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/client";
import deDetail from "@/lib/i18n/de/detail";
import deMeta from "@/lib/i18n/de/meta";

const MESSAGES = { detail: deDetail, meta: deMeta };

/** Compact counters: subtask progress (3/5), comments, attachments. Text, not color, carries meaning. */
export function TicketMeta({ subtaskDone, subtaskTotal, commentCount, attachmentCount, className }: { subtaskDone: number; subtaskTotal: number; commentCount: number; attachmentCount: number; className?: string }) {
  const t = useT(MESSAGES);
  if (!subtaskTotal && !commentCount && !attachmentCount) return null;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-2 text-[11px] text-muted tabular-nums", className)}>
      {subtaskTotal ? (
        <span className={cn("inline-flex items-center gap-0.5", subtaskDone === subtaskTotal && "text-status-done-ink")} title={t.detail.subtaskProgress(subtaskDone, subtaskTotal)}>
          <CheckSquare size={12} />
          {subtaskDone}/{subtaskTotal}
          <span className="sr-only"> {t.detail.subtasks}</span>
        </span>
      ) : null}
      {commentCount ? (
        <span className="inline-flex items-center gap-0.5" title={t.meta.comments(commentCount)}>
          <CommentIcon size={12} />
          {commentCount}
          <span className="sr-only"> {t.meta.comments(commentCount)}</span>
        </span>
      ) : null}
      {attachmentCount ? (
        <span className="inline-flex items-center gap-0.5" title={t.meta.attachments(attachmentCount)}>
          <Paperclip size={12} />
          {attachmentCount}
          <span className="sr-only"> {t.meta.attachments(attachmentCount)}</span>
        </span>
      ) : null}
    </span>
  );
}
