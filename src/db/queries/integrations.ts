import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { activity, externalRef, fieldMapping, integration, syncRun } from "@/db/schema";
import { env } from "@/lib/env";
import { credentialsAad, openCredentials, sealCredentials } from "@/lib/integrations/crypto";
import type { FieldMappingKind, IntegrationStatus, ProviderId, SyncTrigger, WebhookStatus } from "@/lib/integrations/providers";

// Integration rows for the settings UI. Every function filters by workspaceId (CLAUDE.md rule 1);
// the sealed token leaves this module only through openIntegrationToken() – never to a client.

/** Choices of the setup wizard, stored in integration.config. */
export type IntegrationConfig = {
  /** "pk_…1234" – the only part of the token the UI shows. */
  tokenHint?: string;
  accountId?: string;
  accountName?: string;
  /** Accounts the token reaches (to choose from when there are several). */
  accounts?: Array<{ id: string; name: string }>;
  spaceIds?: string[];
  listIds?: string[];
  /** One project per ClickUp space; "list" (one per list) is prepared but not offered yet. */
  projectMode?: "space" | "list";
  /** Wizard progress: the next step to show. */
  step?: "account" | "containers" | "mapping" | "done";
  /** Set when the selection changed: the next run pulls everything instead of the delta. */
  fullResync?: boolean;
};

export type IntegrationView = {
  id: string;
  provider: ProviderId;
  status: IntegrationStatus;
  config: IntegrationConfig;
  lastError: string | null;
  lastSyncAt: Date | null;
  syncRequestedAt: Date | null;
  running: boolean;
  /** Real-time events: null = none (polling every 5 minutes). */
  webhookStatus: WebhookStatus | null;
  webhookEventAt: Date | null;
  createdAt: Date;
};

export function integrationsConfigured(): boolean {
  return Boolean(env.INTEGRATION_SECRET);
}

function secret(): string {
  if (!env.INTEGRATION_SECRET) throw new Error("integration_secret_missing");
  return env.INTEGRATION_SECRET;
}

const viewColumns = {
  id: integration.id,
  provider: integration.provider,
  status: integration.status,
  config: integration.config,
  lastError: integration.lastError,
  lastSyncAt: integration.lastSyncAt,
  syncRequestedAt: integration.syncRequestedAt,
  lockedUntil: integration.lockedUntil,
  webhookStatus: integration.webhookStatus,
  webhookEventAt: integration.webhookEventAt,
  createdAt: integration.createdAt,
};

function toView(r: {
  id: string;
  provider: string;
  status: string;
  config: Record<string, unknown>;
  lastError: string | null;
  lastSyncAt: Date | null;
  syncRequestedAt: Date | null;
  lockedUntil: Date | null;
  webhookStatus: string | null;
  webhookEventAt: Date | null;
  createdAt: Date;
}): IntegrationView {
  return {
    id: r.id,
    provider: r.provider as ProviderId,
    status: r.status as IntegrationStatus,
    config: r.config as IntegrationConfig,
    lastError: r.lastError,
    lastSyncAt: r.lastSyncAt,
    syncRequestedAt: r.syncRequestedAt,
    running: Boolean(r.lockedUntil && r.lockedUntil.getTime() > Date.now()),
    webhookStatus: r.webhookStatus as WebhookStatus | null,
    webhookEventAt: r.webhookEventAt,
    createdAt: r.createdAt,
  };
}

export async function listIntegrations(workspaceId: string): Promise<IntegrationView[]> {
  const rows = await db.select(viewColumns).from(integration).where(eq(integration.workspaceId, workspaceId));
  return rows.map(toView);
}

export async function getIntegration(workspaceId: string, integrationId: string): Promise<IntegrationView | null> {
  const [row] = await db
    .select(viewColumns)
    .from(integration)
    .where(and(eq(integration.id, integrationId), eq(integration.workspaceId, workspaceId)))
    .limit(1);
  return row ? toView(row) : null;
}

export async function findIntegration(workspaceId: string, provider: ProviderId): Promise<IntegrationView | null> {
  const [row] = await db
    .select(viewColumns)
    .from(integration)
    .where(and(eq(integration.workspaceId, workspaceId), eq(integration.provider, provider)))
    .limit(1);
  return row ? toView(row) : null;
}

/**
 * Stores a (new) token for the provider, sealed with the row id as AAD. Replacing the token of an
 * existing connection keeps its selection and mappings.
 */
export async function saveIntegrationToken(
  actor: { workspaceId: string; userId: string },
  provider: ProviderId,
  token: string,
  config: IntegrationConfig,
): Promise<string> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: integration.id, config: integration.config })
      .from(integration)
      .where(and(eq(integration.workspaceId, actor.workspaceId), eq(integration.provider, provider)))
      .for("update")
      .limit(1);
    if (existing) {
      await tx
        .update(integration)
        .set({
          credentials: sealCredentials(token, credentialsAad(existing.id), secret()),
          config: { ...(existing.config as IntegrationConfig), ...config },
          status: (existing.config as IntegrationConfig).step === "done" ? "active" : "setup",
          lastError: null,
        })
        .where(and(eq(integration.id, existing.id), eq(integration.workspaceId, actor.workspaceId)));
      return existing.id;
    }
    const id = crypto.randomUUID();
    await tx.insert(integration).values({
      id,
      workspaceId: actor.workspaceId,
      provider,
      credentials: sealCredentials(token, credentialsAad(id), secret()),
      config: { projectMode: "space", ...config },
      status: "setup",
      createdBy: actor.userId,
    });
    return id;
  });
}

/** Plaintext token for a provider call on the server. Throws CredentialsError when unreadable. */
export async function openIntegrationToken(workspaceId: string, integrationId: string): Promise<string> {
  const [row] = await db
    .select({ credentials: integration.credentials })
    .from(integration)
    .where(and(eq(integration.id, integrationId), eq(integration.workspaceId, workspaceId)))
    .limit(1);
  if (!row) throw new Error("integration_not_found");
  return openCredentials(row.credentials, credentialsAad(integrationId), secret());
}

export async function updateIntegrationConfig(workspaceId: string, integrationId: string, patch: IntegrationConfig, status?: IntegrationStatus) {
  await db
    .update(integration)
    .set({
      config: sql`${integration.config} || ${JSON.stringify(patch)}::jsonb`,
      ...(status ? { status, lastError: null } : {}),
    })
    .where(and(eq(integration.id, integrationId), eq(integration.workspaceId, workspaceId)));
}

/** "Trennen": deletes token, selection, mappings, refs and protocol. Tickets stay. */
export async function deleteIntegration(workspaceId: string, integrationId: string): Promise<boolean> {
  const rows = await db
    .delete(integration)
    .where(and(eq(integration.id, integrationId), eq(integration.workspaceId, workspaceId)))
    .returning({ id: integration.id });
  return rows.length > 0;
}

export async function requestSync(workspaceId: string, integrationId: string) {
  await db
    .update(integration)
    .set({ syncRequestedAt: new Date() })
    .where(and(eq(integration.id, integrationId), eq(integration.workspaceId, workspaceId)));
}

export type FieldMappingRow = { kind: FieldMappingKind; externalValue: string; localValue: string; meta: Record<string, unknown> };

export async function listFieldMappings(workspaceId: string, integrationId: string): Promise<FieldMappingRow[]> {
  const rows = await db
    .select({ kind: fieldMapping.kind, externalValue: fieldMapping.externalValue, localValue: fieldMapping.localValue, meta: fieldMapping.meta })
    .from(fieldMapping)
    .where(and(eq(fieldMapping.workspaceId, workspaceId), eq(fieldMapping.integrationId, integrationId)));
  return rows.map((r) => ({ ...r, kind: r.kind as FieldMappingKind }));
}

/** Upserts mapping rows (by kind + external value). */
export async function saveFieldMappings(workspaceId: string, integrationId: string, rows: FieldMappingRow[]) {
  if (!rows.length) return;
  await db
    .insert(fieldMapping)
    .values(rows.map((r) => ({ workspaceId, integrationId, kind: r.kind, externalValue: r.externalValue.slice(0, 200), localValue: r.localValue.slice(0, 200), meta: r.meta })))
    .onConflictDoUpdate({
      target: [fieldMapping.integrationId, fieldMapping.kind, fieldMapping.externalValue],
      set: { localValue: sql`excluded.local_value`, meta: sql`excluded.meta` },
      setWhere: eq(fieldMapping.workspaceId, workspaceId),
    });
}

export type SyncRunRow = { id: string; trigger: SyncTrigger; startedAt: Date; finishedAt: Date | null; counts: Record<string, number>; error: string | null };

export async function listSyncRuns(workspaceId: string, integrationId: string, limit = 10): Promise<SyncRunRow[]> {
  const rows = await db
    .select({ id: syncRun.id, trigger: syncRun.trigger, startedAt: syncRun.startedAt, finishedAt: syncRun.finishedAt, counts: syncRun.counts, error: syncRun.error })
    .from(syncRun)
    .where(and(eq(syncRun.workspaceId, workspaceId), eq(syncRun.integrationId, integrationId)))
    .orderBy(desc(syncRun.startedAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, trigger: r.trigger as SyncTrigger }));
}

export type TicketSource = { provider: ProviderId; ref: string | null; url: string | null };

/** "Quelle: ClickUp" in the ticket detail – only while the connection exists. */
export async function findTicketSource(workspaceId: string, ticketId: string): Promise<TicketSource | null> {
  const [row] = await db
    .select({ provider: integration.provider, url: externalRef.url, externalId: externalRef.externalId })
    .from(externalRef)
    .innerJoin(integration, and(eq(integration.id, externalRef.integrationId), eq(integration.workspaceId, externalRef.workspaceId)))
    .where(and(eq(externalRef.workspaceId, workspaceId), eq(externalRef.localId, ticketId), eq(externalRef.entityType, "task")))
    .limit(1);
  return row ? { provider: row.provider as ProviderId, ref: row.externalId, url: row.url } : null;
}

/** Workspace-level audit entry (no ticket): connected, disconnected, sync requested. */
export async function logIntegrationEvent(workspaceId: string, actorId: string, type: "integration_connected" | "integration_disconnected" | "integration_sync_requested", payload: Record<string, unknown>) {
  await db.insert(activity).values({ workspaceId, ticketId: null, actorId, type, payload });
}
