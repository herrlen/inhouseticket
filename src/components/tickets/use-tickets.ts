"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { ActivityRow, TicketRow } from "@/db/queries/tickets";
import { useToast } from "@/components/ui/toast";
import { trackEvent } from "@/lib/analytics";
import { keyBetween } from "@/lib/fractional";
import { useT } from "@/lib/i18n/client";
import type { TicketPatch } from "@/lib/validation/ticket";
import deCommon from "@/lib/i18n/de/common";
import deExplorer from "@/lib/i18n/de/explorer";
import deList from "@/lib/i18n/de/list";

const MESSAGES = { common: deCommon, explorer: deExplorer, list: deList };

export const ticketsKey = (projectId: string) => ["tickets", projectId] as const;
export const activityKey = (ticketId: string) => ["activity", ticketId] as const;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status}`);
  return (await res.json()) as T;
}

/** JSON request to our ticket endpoints; throws the server message (in the UI language) on failure, or an empty one – callers fall back. */
async function send<T>(method: "POST" | "PATCH", url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => null)) as T | { error?: { message?: string } } | null;
  if (!res.ok) throw new Error((data as { error?: { message?: string } } | null)?.error?.message ?? "");
  return data as T;
}

export function useTickets(workspaceId: string, projectId: string, initialData: TicketRow[]) {
  return useQuery({
    queryKey: ticketsKey(projectId),
    queryFn: () => getJson<TicketRow[]>(`/api/w/${workspaceId}/projects/${projectId}/tickets`),
    initialData,
    // Light "realtime": refresh every 30 s while the tab is visible (SSE deferred, Sprint 7 P3).
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
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

/** Status id → its category (open/active/done): Matomo gets the category, never the custom name. */
export type StatusCategoryOf = (statusId: string) => string | undefined;

function trackStatusChange(statusId: string | undefined, categoryOf?: StatusCategoryOf) {
  const category = statusId ? categoryOf?.(statusId) : undefined;
  if (category) trackEvent("Ticket", "Status changed", category);
}

/** Optimistic single-ticket update with rollback, toast and retry (KONZEPT §5.5). */
export function useUpdateTicket(workspaceId: string, projectId: string, categoryOf?: StatusCategoryOf) {
  const t = useT(MESSAGES);
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
        message: error.message || t.explorer.saveFailed,
        tone: "error",
        action: { label: t.common.retry, onClick: () => mutation.mutate(variables) },
      });
    },
    onSuccess: (row, { patch }) => {
      qc.setQueryData<TicketRow[]>(ticketsKey(projectId), (list) => list?.map((t) => (t.id === row.id ? row : t)));
      void qc.invalidateQueries({ queryKey: activityKey(row.id) });
      trackStatusChange(patch.statusId, categoryOf);
      if (patch.statusId) router.refresh(); // explorer counts
    },
    onSettled: () => settle(qc, projectId),
  });
  return mutation;
}

export function useCreateTicket(workspaceId: string, projectId: string) {
  const t = useT(MESSAGES);
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
      toast({ message: error.message || t.explorer.saveFailed, tone: "error" });
    },
    onSuccess: (row, _input, context) => {
      qc.setQueryData<TicketRow[]>(ticketsKey(projectId), (list) => list?.map((t) => (t.id === context?.tempId ? row : t)));
      trackEvent("Ticket", "Created");
      router.refresh(); // explorer counts
    },
    onSettled: () => settle(qc, projectId),
  });
}

export function useBulkUpdate(workspaceId: string, projectId: string, categoryOf?: StatusCategoryOf) {
  const t = useT(MESSAGES);
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
      toast({ message: error.message || t.explorer.saveFailed, tone: "error" });
    },
    onSuccess: (rows, { patch }) => {
      const byId = new Map(rows.map((r) => [r.id, r]));
      qc.setQueryData<TicketRow[]>(ticketsKey(projectId), (list) => list?.map((t) => byId.get(t.id) ?? t));
      toast({ message: t.list.bulkDone(rows.length), tone: "success" });
      trackStatusChange(patch.statusId, categoryOf);
      if (patch.statusId) router.refresh();
    },
    onSettled: () => settle(qc, projectId),
  });
}
