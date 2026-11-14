import "server-only";
import { and, asc, eq, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { integration, integrationEvent } from "@/db/schema";
import { env } from "@/lib/env";
import { CredentialsError, openCredentials, sealCredentials, webhookAad } from "@/lib/integrations/crypto";
import type { ProviderId, WebhookEventKind, WebhookStatus } from "@/lib/integrations/providers";
import type { RegisteredWebhook } from "@/lib/integrations/types";
import { MAX_QUEUED_WEBHOOK_EVENTS } from "@/lib/limits";

// Webhook state of an integration and its event queue (ADR 008, addendum webhooks). The sealed
// webhook (id + secret) leaves this module only to the webhook route and the engine – never to a
// client. Everything is scoped to the integration's workspace; the one exception is the lookup by
// integration id in webhookReceiver(): the caller is ClickUp, the id comes from the URL and only
// a valid signature (checked right after) lets anything through.

function secret(): string {
  if (!env.INTEGRATION_SECRET) throw new CredentialsError("no_secret");
  return env.INTEGRATION_SECRET;
}

function seal(hook: RegisteredWebhook, integrationId: string): string {
  return sealCredentials(JSON.stringify({ id: hook.id, secret: hook.secret }), webhookAad(integrationId), secret());
}

function open(sealed: string, integrationId: string): RegisteredWebhook | null {
  const value: unknown = JSON.parse(openCredentials(sealed, webhookAad(integrationId), secret()));
  const o = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return typeof o.id === "string" && typeof o.secret === "string" && o.id && o.secret ? { id: o.id, secret: o.secret } : null;
}

/** Stores (or clears) the registered webhook and its status; marks the time of this check. */
export async function saveWebhook(workspaceId: string, integrationId: string, hook: RegisteredWebhook | null, status: WebhookStatus | null) {
  await db
    .update(integration)
    .set({ webhook: hook ? seal(hook, integrationId) : null, webhookStatus: status, webhookCheckedAt: new Date() })
    .where(and(eq(integration.id, integrationId), eq(integration.workspaceId, workspaceId)));
}

export async function setWebhookStatus(workspaceId: string, integrationId: string, status: WebhookStatus) {
  await db
    .update(integration)
    .set({ webhookStatus: status, webhookCheckedAt: new Date() })
    .where(and(eq(integration.id, integrationId), eq(integration.workspaceId, workspaceId)));
}

/** The stored webhook, or null (none, or no longer readable – then it is registered anew). */
export async function openWebhook(workspaceId: string, integrationId: string): Promise<RegisteredWebhook | null> {
  const [row] = await db
    .select({ webhook: integration.webhook })
    .from(integration)
    .where(and(eq(integration.id, integrationId), eq(integration.workspaceId, workspaceId)))
    .limit(1);
  if (!row?.webhook) return null;
  try {
    return open(row.webhook, integrationId);
  } catch (e) {
    console.error("integration webhook: stored webhook unreadable", { integrationId, code: e instanceof CredentialsError ? e.code : "malformed" });
    return null;
  }
}

export type WebhookState = {
  id: string;
  workspaceId: string;
  provider: ProviderId;
  status: string;
  config: { accountId?: string; spaceIds?: string[]; listIds?: string[]; step?: string };
  hasWebhook: boolean;
  webhookStatus: WebhookStatus | null;
  webhookCheckedAt: Date | null;
};

/** Webhook bookkeeping of one integration (for the poller's maintenance, which only has the id). */
export async function webhookState(integrationId: string): Promise<WebhookState | null> {
  const [row] = await db
    .select({
      id: integration.id,
      workspaceId: integration.workspaceId,
      provider: integration.provider,
      status: integration.status,
      config: integration.config,
      hasWebhook: sql<boolean>`${integration.webhook} is not null`,
      webhookStatus: integration.webhookStatus,
      webhookCheckedAt: integration.webhookCheckedAt,
    })
    .from(integration)
    .where(eq(integration.id, integrationId))
    .limit(1);
  return row ? { ...row, provider: row.provider as ProviderId, config: row.config as WebhookState["config"], webhookStatus: row.webhookStatus as WebhookStatus | null } : null;
}

export type WebhookReceiver = { integrationId: string; workspaceId: string; provider: ProviderId; webhook: RegisteredWebhook };

/**
 * The integration an event is addressed to – only while it is set up, active and has a webhook.
 * Everything else (unknown id, disconnected, token revoked, no webhook) is the same null.
 */
export async function webhookReceiver(integrationId: string): Promise<WebhookReceiver | null> {
  const [row] = await db
    .select({ id: integration.id, workspaceId: integration.workspaceId, provider: integration.provider, webhook: integration.webhook, config: integration.config })
    .from(integration)
    .where(and(eq(integration.id, integrationId), eq(integration.status, "active"), isNotNull(integration.webhook)))
    .limit(1);
  if (!row?.webhook || (row.config as { step?: string }).step !== "done") return null;
  let webhook: RegisteredWebhook | null;
  try {
    webhook = open(row.webhook, row.id);
  } catch {
    return null;
  }
  return webhook ? { integrationId: row.id, workspaceId: row.workspaceId, provider: row.provider as ProviderId, webhook } : null;
}

/**
 * Queues one verified event (idempotent per task and kind: a repeat only refreshes the time) and
 * notes when the last event arrived. A full queue asks for a delta sync instead ("overflow").
 */
export async function enqueueWebhookEvent(target: { integrationId: string; workspaceId: string }, event: { taskId: string; kind: WebhookEventKind }): Promise<"queued" | "overflow"> {
  const scope = and(eq(integrationEvent.integrationId, target.integrationId), eq(integrationEvent.workspaceId, target.workspaceId));
  const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(integrationEvent).where(scope);
  const now = new Date();
  const integ = and(eq(integration.id, target.integrationId), eq(integration.workspaceId, target.workspaceId));
  if (n >= MAX_QUEUED_WEBHOOK_EVENTS) {
    await db.update(integration).set({ webhookEventAt: now, syncRequestedAt: now }).where(integ);
    return "overflow";
  }
  await db
    .insert(integrationEvent)
    .values({ workspaceId: target.workspaceId, integrationId: target.integrationId, externalId: event.taskId.slice(0, 100), kind: event.kind, receivedAt: now })
    .onConflictDoUpdate({
      target: [integrationEvent.integrationId, integrationEvent.externalId, integrationEvent.kind],
      set: { receivedAt: now },
      setWhere: eq(integrationEvent.workspaceId, target.workspaceId),
    });
  await db.update(integration).set({ webhookEventAt: now }).where(integ);
  return "queued";
}

/** Asks for a delta sync (rate limit of the endpoint exceeded): the poller picks it up next minute. */
export async function requestDeltaSync(target: { integrationId: string; workspaceId: string }) {
  const now = new Date();
  await db
    .update(integration)
    .set({ webhookEventAt: now, syncRequestedAt: now })
    .where(and(eq(integration.id, target.integrationId), eq(integration.workspaceId, target.workspaceId)));
}

export type QueuedEvent = { id: string; externalId: string; kind: WebhookEventKind; receivedAt: Date };

/** Oldest queued events of an integration. */
export async function queuedEvents(integ: { id: string; workspaceId: string }, limit: number): Promise<QueuedEvent[]> {
  const rows = await db
    .select({ id: integrationEvent.id, externalId: integrationEvent.externalId, kind: integrationEvent.kind, receivedAt: integrationEvent.receivedAt })
    .from(integrationEvent)
    .where(and(eq(integrationEvent.integrationId, integ.id), eq(integrationEvent.workspaceId, integ.workspaceId)))
    .orderBy(asc(integrationEvent.receivedAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, kind: r.kind as WebhookEventKind }));
}

/**
 * Removes a processed event – unless it came in again meanwhile (newer receivedAt): then the row
 * stays and the task is read once more.
 */
export async function dropEvent(integ: { id: string; workspaceId: string }, event: QueuedEvent) {
  await db
    .delete(integrationEvent)
    .where(and(eq(integrationEvent.id, event.id), eq(integrationEvent.workspaceId, integ.workspaceId), lte(integrationEvent.receivedAt, event.receivedAt)));
}

/** Removes all queued events (selection gone, integration not set up). */
export async function clearEvents(integ: { id: string; workspaceId: string }) {
  await db.delete(integrationEvent).where(and(eq(integrationEvent.integrationId, integ.id), eq(integrationEvent.workspaceId, integ.workspaceId)));
}

/** Integrations with queued events that are not running right now (the poller's catch-up). */
export async function integrationsWithEvents(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ id: integration.id })
    .from(integrationEvent)
    .innerJoin(integration, and(eq(integration.id, integrationEvent.integrationId), eq(integration.workspaceId, integrationEvent.workspaceId)))
    .where(and(eq(integration.status, "active"), or(isNull(integration.lockedUntil), lt(integration.lockedUntil, new Date()))));
  return rows.map((r) => r.id);
}
