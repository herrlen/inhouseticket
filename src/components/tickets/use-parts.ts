"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  convertChecklistItemAction,
  createCommentAction,
  createSubtaskAction,
  deleteAttachmentAction,
  deleteCommentAction,
  deleteSubtaskAction,
  updateCommentAction,
  updateSubtaskAction,
} from "@/app/(app)/[workspace]/ticket-actions";
import type { TicketSource } from "@/db/queries/integrations";
import type { AttachmentRow, CommentRow, SubtaskRow } from "@/db/queries/ticket-parts";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/lib/i18n/client";
import { activityKey, ticketsKey } from "./use-tickets";
import deExplorer from "@/lib/i18n/de/explorer";

const MESSAGES = { explorer: deExplorer };

/**
 * `manageAttachments`: the viewer may delete every attachment (ticket author or admin), not just their own.
 * `source`: the tool the ticket is synced from ("Quelle: ClickUp"), null for tickets made here.
 */
export type Parts = { subtasks: SubtaskRow[]; attachments: AttachmentRow[]; comments: CommentRow[]; manageAttachments: boolean; source: TicketSource | null };
export const partsKey = (ticketId: string) => ["parts", ticketId] as const;

export function useParts(workspaceId: string, ticketId: string) {
  return useQuery({
    queryKey: partsKey(ticketId),
    queryFn: async () => {
      const res = await fetch(`/api/w/${workspaceId}/tickets/${ticketId}/parts`);
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as Parts;
    },
    staleTime: 0,
  });
}

/** Runs a server action; on success refreshes parts, list counts and activity. */
export function usePartMutation<I, O>(workspaceId: string, projectId: string, ticketId: string, run: (input: I) => Promise<{ ok: true; data: O } | { ok: false; error: string }>, optimistic?: (parts: Parts, input: I) => Parts) {
  const qc = useQueryClient();
  const toast = useToast();
  const t = useT(MESSAGES);
  return useMutation({
    mutationFn: async (input: I) => {
      const r = await run(input);
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
    onMutate: async (input) => {
      if (!optimistic) return {};
      await qc.cancelQueries({ queryKey: partsKey(ticketId) });
      const previous = qc.getQueryData<Parts>(partsKey(ticketId));
      if (previous) qc.setQueryData(partsKey(ticketId), optimistic(previous, input));
      return { previous };
    },
    onError: (error, _input, context) => {
      if (context && "previous" in context && context.previous) qc.setQueryData(partsKey(ticketId), context.previous);
      toast({ message: error.message || t.explorer.saveFailed, tone: "error" });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: partsKey(ticketId) });
      void qc.invalidateQueries({ queryKey: ticketsKey(projectId) });
      void qc.invalidateQueries({ queryKey: activityKey(ticketId) });
    },
  });
}

export function usePartActions(workspaceId: string, projectId: string, ticketId: string) {
  const ids = [workspaceId, projectId, ticketId] as const;
  const addSubtask = usePartMutation(...ids, (title: string) => createSubtaskAction({ workspaceId, ticketId, title }));
  const toggleSubtask = usePartMutation(
    ...ids,
    (i: { id: string; done: boolean }) => updateSubtaskAction({ workspaceId, subtaskId: i.id, done: i.done }),
    (p, i) => ({ ...p, subtasks: p.subtasks.map((s) => (s.id === i.id ? { ...s, done: i.done } : s)) }),
  );
  const renameSubtask = usePartMutation(
    ...ids,
    (i: { id: string; title: string }) => updateSubtaskAction({ workspaceId, subtaskId: i.id, title: i.title }),
    (p, i) => ({ ...p, subtasks: p.subtasks.map((s) => (s.id === i.id ? { ...s, title: i.title } : s)) }),
  );
  const removeSubtask = usePartMutation(
    ...ids,
    (id: string) => deleteSubtaskAction({ workspaceId, subtaskId: id }),
    (p, id) => ({ ...p, subtasks: p.subtasks.filter((s) => s.id !== id) }),
  );
  const removeAttachment = usePartMutation(
    ...ids,
    (id: string) => deleteAttachmentAction({ workspaceId, attachmentId: id }),
    (p, id) => ({ ...p, attachments: p.attachments.filter((a) => a.id !== id) }),
  );
  const addComment = usePartMutation(...ids, (body: string) => createCommentAction({ workspaceId, ticketId, body }));
  const editComment = usePartMutation(
    ...ids,
    (i: { id: string; body: string }) => updateCommentAction({ workspaceId, commentId: i.id, body: i.body }),
    (p, i) => ({ ...p, comments: p.comments.map((c) => (c.id === i.id ? { ...c, body: i.body, editedAt: new Date().toISOString() } : c)) }),
  );
  const removeComment = usePartMutation(
    ...ids,
    (id: string) => deleteCommentAction({ workspaceId, commentId: id }),
    (p, id) => ({ ...p, comments: p.comments.filter((c) => c.id !== id) }),
  );
  const convertSubtask = usePartMutation(
    ...ids,
    (id: string) => convertChecklistItemAction({ workspaceId, subtaskId: id }),
    (p, id) => ({ ...p, subtasks: p.subtasks.filter((s) => s.id !== id) }),
  );
  return { addSubtask, toggleSubtask, renameSubtask, removeSubtask, convertSubtask, removeAttachment, addComment, editComment, removeComment };
}
