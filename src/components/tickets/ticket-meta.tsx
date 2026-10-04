import { CheckSquare, CommentIcon, Paperclip } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { de } from "@/lib/i18n/de";

/** Compact counters: subtask progress (3/5), comments, attachments. Text, not color, carries meaning. */
export function TicketMeta({ subtaskDone, subtaskTotal, commentCount, attachmentCount, className }: { subtaskDone: number; subtaskTotal: number; commentCount: number; attachmentCount: number; className?: string }) {
  if (!subtaskTotal && !commentCount && !attachmentCount) return null;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-2 text-[11px] text-muted tabular-nums", className)}>
      {subtaskTotal ? (
        <span className={cn("inline-flex items-center gap-0.5", subtaskDone === subtaskTotal && "text-status-done-ink")} title={de.detail.subtaskProgress(subtaskDone, subtaskTotal)}>
          <CheckSquare size={12} />
          {subtaskDone}/{subtaskTotal}
          <span className="sr-only"> {de.detail.subtasks}</span>
        </span>
      ) : null}
      {commentCount ? (
        <span className="inline-flex items-center gap-0.5" title={de.meta.comments(commentCount)}>
          <CommentIcon size={12} />
          {commentCount}
          <span className="sr-only"> {de.meta.comments(commentCount)}</span>
        </span>
      ) : null}
      {attachmentCount ? (
        <span className="inline-flex items-center gap-0.5" title={de.meta.attachments(attachmentCount)}>
          <Paperclip size={12} />
          {attachmentCount}
          <span className="sr-only"> {de.meta.attachments(attachmentCount)}</span>
        </span>
      ) : null}
    </span>
  );
}
