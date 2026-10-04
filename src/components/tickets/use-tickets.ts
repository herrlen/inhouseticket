"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
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

/** JSON request to our ticket endpoints; throws the German server message on failure. */
async function send<T>(method: "POST" | "PATCH", url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => null)) as T | { error?: { message?: string } } | null;
  if (!res.ok) throw new Error((data as { error?: { message?: string } } | null)?.error?.message ?? de.explorer.saveFailed);
  return data as T;
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

/**
 * After every mutation, refetch the list once no other ticket mutation is running. This cancels a
 * background refetch that started before the server committed (it would otherwise land late and
 * overwrite the confirmed value with stale data).
 */
function settle(qc: ReturnType<typeof useQueryClient>, projectId: string) {
  if (qc.isMutating({ mutationKey: ["tickets", projectId] }) <= 1) {
    void qc.invalidateQueries({ queryKey: ticketsKey(projectId) });
  }
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
    mutationKey: ["tickets", projectId],
    mutationFn: ({ ticketId, patch }: { ticketId: string; patch: TicketPatch }) =>
      send<TicketRow>("PATCH", `/api/w/${workspaceId}/tickets/${ticketId}`, patch),
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
    onSettled: () => settle(qc, projectId),
  });
  return mutation;
}

export function useCreateTicket(workspaceId: string, projectId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  return useMutation({
    mutationKey: ["tickets", projectId],
    mutationFn: (input: { title: string; statusId?: string; priority?: number; assigneeId?: string | null; dueDate?: string | null }) =>
      send<TicketRow>("POST", `/api/w/${workspaceId}/projects/${projectId}/tickets`, input),
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
        dueDate: input.dueDate ?? null,
        sort: keyBetween(null, firstSort),
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        labelIds: [],
        subtaskTotal: 0,
        subtaskDone: 0,
        commentCount: 0,
        attachmentCount: 0,
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
      router.refresh(); // explorer counts
    },
    onSettled: () => settle(qc, projectId),
  });
}

export function useBulkUpdate(workspaceId: string, projectId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  return useMutation({
    mutationKey: ["tickets", projectId],
    mutationFn: ({ ticketIds, patch }: { ticketIds: string[]; patch: Pick<TicketPatch, "statusId" | "priority" | "assigneeId"> }) =>
      send<TicketRow[]>("PATCH", `/api/w/${workspaceId}/tickets`, { ticketIds, patch }),
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
    onSettled: () => settle(qc, projectId),
  });
}
