"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import {
  deleteIntegration,
  findIntegration,
  integrationsConfigured,
  logIntegrationEvent,
  requestSync,
  saveFieldMappings,
  saveIntegrationToken,
  updateIntegrationConfig,
  type FieldMappingRow,
} from "@/db/queries/integrations";
import { listImportMembers } from "@/db/queries/import";
import { requireRole } from "@/lib/authz";
import { getT } from "@/lib/i18n/server";
import { tokenHint } from "@/lib/integrations/crypto";
import { connectorFor, runSync } from "@/lib/integrations/engine";
import { STATUS_TARGETS, suggestStatus } from "@/lib/integrations/mapping";
import { ConnectorError } from "@/lib/integrations/types";
import { registerWebhook, removeWebhook } from "@/lib/integrations/webhook-sync";
import { rateLimit } from "@/lib/rate-limit";
import { loadContainers, loadPeople } from "./data";

// Setup and maintenance of the ClickUp connection. Every action checks the admin role itself
// (CLAUDE.md rule 1) – the page being admin-only is not enough. The token is only ever handled
// here and in the engine; nothing that reaches the client contains it.

const TOKEN_CHECKS_PER_HOUR = 20;
const page = (slug: string) => `/${slug}/settings/integrations/clickup`;

export type TokenState = { error?: string };

const tokenSchema = z.object({
  workspaceId: z.uuid(),
  token: z.string().trim().min(10).max(200).regex(/^[\w-]+$/),
});

export async function connectAction(_: TokenState, formData: FormData): Promise<TokenState> {
  const t = await getT();
  const parsed = tokenSchema.safeParse({ workspaceId: formData.get("workspaceId"), token: formData.get("token") ?? "" });
  if (!parsed.success) return { error: t.integrations.clickup.tokenInvalid };
  const ctx = await requireRole({ workspaceId: parsed.data.workspaceId }, "admin");
  if (!integrationsConfigured()) return { error: t.integrations.notConfigured };
  if (!rateLimit(`integration-token:${ctx.workspace.id}`, TOKEN_CHECKS_PER_HOUR, 3_600_000).ok) return { error: t.integrations.clickup.tooManyAttempts };

  let accounts: Array<{ id: string; name: string }>;
  try {
    accounts = (await connectorFor("clickup", parsed.data.token).testConnection()).accounts;
  } catch (e) {
    const code = e instanceof ConnectorError ? e.code : "unavailable";
    return { error: code === "unauthorized" ? t.integrations.clickup.tokenRejected : t.integrations.clickup.unavailable };
  }
  if (!accounts.length) return { error: t.integrations.clickup.noAccounts };

  const existing = await findIntegration(ctx.workspace.id, "clickup");
  // A new token for the same ClickUp workspace keeps the setup; otherwise the wizard starts over.
  const sameAccount = existing?.config.accountId && accounts.some((a) => a.id === existing.config.accountId);
  const single = accounts.length === 1 ? accounts[0]! : null;
  const config = sameAccount
    ? { tokenHint: tokenHint(parsed.data.token), accounts }
    : {
        tokenHint: tokenHint(parsed.data.token),
        accounts,
        accountId: single?.id,
        accountName: single?.name,
        spaceIds: [],
        listIds: [],
        step: single ? ("containers" as const) : ("account" as const),
      };
  const id = await saveIntegrationToken({ workspaceId: ctx.workspace.id, userId: ctx.user.id }, "clickup", parsed.data.token, config);
  if (!sameAccount && existing) await updateIntegrationConfig(ctx.workspace.id, id, config, "setup");
  await logIntegrationEvent(ctx.workspace.id, ctx.user.id, "integration_connected", { provider: "clickup" });
  // Webhooks belong to the token that created them: a new token registers anew (or removes it
  // when the wizard starts over).
  refreshWebhook(ctx.workspace.id, id);
  revalidatePath(page(ctx.workspace.slug));
  redirect(page(ctx.workspace.slug));
}

const accountSchema = z.object({ workspaceId: z.uuid(), accountId: z.string().min(1).max(50) });

export async function chooseAccountAction(formData: FormData) {
  const parsed = accountSchema.safeParse({ workspaceId: formData.get("workspaceId"), accountId: formData.get("accountId") });
  if (!parsed.success) return;
  const ctx = await requireRole({ workspaceId: parsed.data.workspaceId }, "admin");
  const integ = await findIntegration(ctx.workspace.id, "clickup");
  const account = integ?.config.accounts?.find((a) => a.id === parsed.data.accountId);
  if (!integ || !account) return;
  await updateIntegrationConfig(ctx.workspace.id, integ.id, { accountId: account.id, accountName: account.name, spaceIds: [], listIds: [], step: "containers" }, "setup");
  revalidatePath(page(ctx.workspace.slug));
}

const selectionSchema = z.object({
  workspaceId: z.uuid(),
  spaces: z.array(z.string().min(1).max(50)).max(500),
  lists: z.array(z.string().min(1).max(50)).max(5000),
});

export type SelectionState = { error?: string };

export async function saveSelectionAction(_: SelectionState, formData: FormData): Promise<SelectionState> {
  const t = await getT();
  const parsed = selectionSchema.safeParse({ workspaceId: formData.get("workspaceId"), spaces: formData.getAll("space"), lists: formData.getAll("list") });
  if (!parsed.success) return { error: t.common.invalidInput };
  const ctx = await requireRole({ workspaceId: parsed.data.workspaceId }, "admin");
  const integ = await findIntegration(ctx.workspace.id, "clickup");
  if (!integ?.config.accountId) return { error: t.common.invalidInput };
  // Only ids that exist in the account; lists inside a fully selected space are implied.
  const tree = await loadContainers(ctx.workspace.id, integ.id, integ.config.accountId);
  if (!tree) return { error: t.integrations.clickup.loadFailed };
  const spaces = tree.filter((s) => parsed.data.spaces.includes(s.id));
  const listIds = tree
    .filter((s) => !parsed.data.spaces.includes(s.id))
    .flatMap((s) => s.children.flatMap((c) => (c.kind === "list" ? [c] : c.children)))
    .map((l) => l.id)
    .filter((id) => parsed.data.lists.includes(id));
  if (!spaces.length && !listIds.length) return { error: t.integrations.clickup.containersEmpty };
  const done = integ.config.step === "done";
  await updateIntegrationConfig(ctx.workspace.id, integ.id, { spaceIds: spaces.map((s) => s.id), listIds, fullResync: true, step: done ? "done" : "mapping" });
  if (done) refreshWebhook(ctx.workspace.id, integ.id);
  revalidatePath(page(ctx.workspace.slug));
  redirect(done ? `${page(ctx.workspace.slug)}?schritt=zuordnung` : page(ctx.workspace.slug));
}

const mappingSchema = z.object({ workspaceId: z.uuid() });

export async function saveMappingAction(formData: FormData) {
  const parsed = mappingSchema.safeParse({ workspaceId: formData.get("workspaceId") });
  if (!parsed.success) return;
  const ctx = await requireRole({ workspaceId: parsed.data.workspaceId }, "admin");
  const integ = await findIntegration(ctx.workspace.id, "clickup");
  if (!integ?.config.accountId) return;

  const rows: FieldMappingRow[] = [];
  // Statuses: "status:<name>" → target; only the allowed targets are taken.
  const tree = (await loadContainers(ctx.workspace.id, integ.id, integ.config.accountId)) ?? [];
  const known = new Map(tree.flatMap((s) => s.statuses ?? []).map((s) => [s.name.toLowerCase(), s]));
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("status:") || typeof value !== "string") continue;
    const name = key.slice("status:".length).trim().slice(0, 200);
    if (!name || !(STATUS_TARGETS as readonly string[]).includes(value)) continue;
    const ext = known.get(name.toLowerCase()) ?? { name, type: "custom", color: null };
    rows.push({ kind: "status", externalValue: name, localValue: value, meta: { category: suggestStatus(ext).category, color: ext.color, type: ext.type } });
  }
  // People: "person:<clickupId>" → member id or "" – only members of this workspace are accepted.
  const members = new Set((await listImportMembers(ctx.workspace.id)).map((m) => m.id));
  const people = new Map(((await loadPeople(ctx.workspace.id, integ.id, integ.config.accountId)) ?? []).map((p) => [p.id, p]));
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("person:") || typeof value !== "string") continue;
    const person = people.get(key.slice("person:".length));
    if (!person) continue;
    rows.push({ kind: "user", externalValue: person.id, localValue: members.has(value) ? value : "", meta: { name: person.name } });
  }
  for (const [ext, local] of [["1", "4"], ["2", "3"], ["3", "2"], ["4", "1"]] as const) rows.push({ kind: "priority", externalValue: ext, localValue: local, meta: {} });
  await saveFieldMappings(ctx.workspace.id, integ.id, rows);

  const first = integ.config.step !== "done";
  await updateIntegrationConfig(ctx.workspace.id, integ.id, { step: "done" }, first ? "active" : undefined);
  if (first) {
    await startSync(ctx.workspace.id, integ.id, ctx.user.id, "initial");
    refreshWebhook(ctx.workspace.id, integ.id);
  }
  revalidatePath(page(ctx.workspace.slug));
  redirect(page(ctx.workspace.slug));
}

async function startSync(workspaceId: string, integrationId: string, userId: string, trigger: "initial" | "manual") {
  await requestSync(workspaceId, integrationId);
  await logIntegrationEvent(workspaceId, userId, "integration_sync_requested", { provider: "clickup", trigger });
  // Runs after the response; the lease keeps it single next to the 5-minute poller.
  after(() =>
    runSync(integrationId, trigger).catch((e: unknown) => console.error("integration sync: background run failed", e instanceof Error ? e.message.slice(0, 80) : "unknown")),
  );
}

/** (Re-)registers the real-time webhook after the response (ClickUp round trips, never fails the action). */
function refreshWebhook(workspaceId: string, integrationId: string) {
  after(() =>
    registerWebhook(workspaceId, integrationId).catch((e: unknown) => console.error("integration webhook: background registration failed", e instanceof Error ? e.message.slice(0, 80) : "unknown")),
  );
}

const idSchema = z.object({ workspaceId: z.uuid() });

export async function syncNowAction(formData: FormData) {
  const parsed = idSchema.safeParse({ workspaceId: formData.get("workspaceId") });
  if (!parsed.success) return;
  const ctx = await requireRole({ workspaceId: parsed.data.workspaceId }, "admin");
  const integ = await findIntegration(ctx.workspace.id, "clickup");
  if (!integ || integ.config.step !== "done") return;
  await startSync(ctx.workspace.id, integ.id, ctx.user.id, "manual");
  revalidatePath(page(ctx.workspace.slug));
}

export async function disconnectAction(formData: FormData) {
  const parsed = idSchema.safeParse({ workspaceId: formData.get("workspaceId") });
  if (!parsed.success || formData.get("confirm") !== "yes") return;
  const ctx = await requireRole({ workspaceId: parsed.data.workspaceId }, "admin");
  const integ = await findIntegration(ctx.workspace.id, "clickup");
  // Before the row (and the token) is gone: the webhook at ClickUp needs the token to be removed.
  if (integ) await removeWebhook(ctx.workspace.id, integ.id);
  if (integ && (await deleteIntegration(ctx.workspace.id, integ.id))) {
    await logIntegrationEvent(ctx.workspace.id, ctx.user.id, "integration_disconnected", { provider: "clickup" });
  }
  revalidatePath(`/${ctx.workspace.slug}/settings/integrations`);
  redirect(`/${ctx.workspace.slug}/settings/integrations?getrennt=clickup`);
}
