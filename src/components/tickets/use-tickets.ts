"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { bulkUpdateTicketsAction, createTicketAction, updateTicketAction } from "@/app/(app)/[workspace]/ticket-actions";
import type { ActivityRow, TicketRow } from "@/db/queries/tickets";
import { useToast } from "@/components/ui/toast";
import { keyBetween } from "@/lib/fractional";
import { de } from "@/lib/i18n/de";
import type { TicketPatch } from "@/lib/validation/ticket";

export const ticketsKey = (projectId: string) => ["tickets", projectId] as const;
export const activityKey = (ticketId: string) => ["activity", ticketId] as const;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status}`);
  return (await res.json()) as T;
}

export function useTickets(workspaceId: string, projectId: string, initialData: TicketRow[]) {
  return useQuery({
    queryKey: ticketsKey(projectId),
    queryFn: () => getJson<TicketRow[]>(`/api/w/${workspaceId}/projects/${projectId}/tickets`),
    initialData,
  });
}

export function useActivity(workspaceId: string, ticketId: string | null) {
  return useQuery({
    queryKey: activityKey(ticketId ?? "none"),
    queryFn: () => getJson<ActivityRow[]>(`/api/w/${workspaceId}/tickets/${ticketId}/activity`),
    enabled: Boolean(ticketId),
    staleTime: 0,
  });
}

/** Applies a patch locally the way the server will (labels, due date, status). */
function applyPatch(t: TicketRow, patch: TicketPatch): TicketRow {
  const { labelIds, ...rest } = patch;
  return { ...t, ...rest, ...(labelIds ? { labelIds } : {}), updatedAt: new Date().toISOString() } as TicketRow;
}

/** Optimistic single-ticket update with rollback, toast and retry (KONZEPT §5.5). */
export function useUpdateTicket(workspaceId: string, projectId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();

  const mutation = useMutation({
    mutationFn: async ({ ticketId, patch }: { ticketId: string; patch: TicketPatch }) => {
      const r = await updateTicketAction({ workspaceId, ticketId, patch });
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
    onMutate: async ({ ticketId, patch }) => {
      await qc.cancelQueries({ queryKey: ticketsKey(projectId) });
      const previous = qc.getQueryData<TicketRow[]>(ticketsKey(projectId));
      qc.setQueryData<TicketRow[]>(ticketsKey(projectId), (list) => list?.map((t) => (t.id === ticketId ? applyPatch(t, patch) : t)));
      return { previous };
    },
    onError: (error, variables, context) => {
      if (context?.previous) qc.setQueryData(ticketsKey(projectId), context.previous);
      toast({
        message: error.message || de.explorer.saveFailed,
        tone: "error",
        action: { label: de.common.retry, onClick: () => mutation.mutate(variables) },
      });
    },
    onSuccess: (row, { patch }) => {
      qc.setQueryData<TicketRow[]>(ticketsKey(projectId), (list) => list?.map((t) => (t.id === row.id ? row : t)));
      void qc.invalidateQueries({ queryKey: activityKey(row.id) });
      if (patch.statusId) router.refresh(); // explorer counts
    },
  });
  return mutation;
}

export function useCreateTicket(workspaceId: string, projectId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: async (input: { title: string; statusId?: string; priority?: number; assigneeId?: string | null }) => {
      const r = await createTicketAction({ workspaceId, projectId, ...input });
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ticketsKey(projectId) });
      const previous = qc.getQueryData<TicketRow[]>(ticketsKey(projectId)) ?? [];
      const firstSort = [...previous].map((t) => t.sort).sort()[0] ?? null;
      const now = new Date().toISOString();
      const temp: TicketRow = {
        id: `temp-${crypto.randomUUID()}`,
        projectId,
        number: 0, // shown as "…" until the server answers
        title: input.title,
        description: null,
        statusId: input.statusId ?? "",
        priority: input.priority ?? 0,
        assigneeId: input.assigneeId ?? null,
        dueDate: null,
        sort: keyBetween(null, firstSort),
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        labelIds: [],
      };
      qc.setQueryData<TicketRow[]>(ticketsKey(projectId), [temp, ...previous]);
      return { previous, tempId: temp.id };
    },
    onError: (error, _input, context) => {
      if (context) qc.setQueryData(ticketsKey(projectId), context.previous);
      toast({ message: error.message || de.explorer.saveFailed, tone: "error" });
    },
    onSuccess: (row, _input, context) => {
      qc.setQueryData<TicketRow[]>(ticketsKey(projectId), (list) => list?.map((t) => (t.id === context?.tempId ? row : t)));
    },
  });
}

export function useBulkUpdate(workspaceId: string, projectId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  return useMutation({
    mutationFn: async ({ ticketIds, patch }: { ticketIds: string[]; patch: Pick<TicketPatch, "statusId" | "priority" | "assigneeId"> }) => {
      const r = await bulkUpdateTicketsAction({ workspaceId, ticketIds, patch });
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
    onMutate: async ({ ticketIds, patch }) => {
      await qc.cancelQueries({ queryKey: ticketsKey(projectId) });
      const previous = qc.getQueryData<TicketRow[]>(ticketsKey(projectId));
      qc.setQueryData<TicketRow[]>(ticketsKey(projectId), (list) => list?.map((t) => (ticketIds.includes(t.id) ? applyPatch(t, patch) : t)));
      return { previous };
    },
    onError: (error, _v, context) => {
      if (context?.previous) qc.setQueryData(ticketsKey(projectId), context.previous);
      toast({ message: error.message || de.explorer.saveFailed, tone: "error" });
    },
    onSuccess: (rows, { patch }) => {
      const byId = new Map(rows.map((r) => [r.id, r]));
      qc.setQueryData<TicketRow[]>(ticketsKey(projectId), (list) => list?.map((t) => byId.get(t.id) ?? t));
      toast({ message: de.list.bulkDone(rows.length), tone: "success" });
      if (patch.statusId) router.refresh();
    },
  });
}
