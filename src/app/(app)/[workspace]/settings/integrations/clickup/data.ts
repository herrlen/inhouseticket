import "server-only";
import { openIntegrationToken } from "@/db/queries/integrations";
import { connectorFor } from "@/lib/integrations/engine";
import type { ContainerNode, ExternalPerson } from "@/lib/integrations/types";

// Live data from ClickUp for the wizard (tree, people), cached briefly per integration: the tree
// costs two requests per space, and the token's budget is shared with the running sync.

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; value: unknown }>();

async function cached<T>(key: string, load: () => Promise<T>): Promise<T | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  try {
    const value = await load();
    cache.set(key, { at: Date.now(), value });
    if (cache.size > 500) for (const [k, v] of cache) if (Date.now() - v.at >= TTL_MS) cache.delete(k);
    return value;
  } catch (e) {
    console.error("integrations: loading from provider failed", e instanceof Error ? e.message.slice(0, 80) : "unknown");
    return null;
  }
}

export function loadContainers(workspaceId: string, integrationId: string, accountId: string): Promise<ContainerNode[] | null> {
  return cached(`tree:${integrationId}:${accountId}`, async () => connectorFor("clickup", await openIntegrationToken(workspaceId, integrationId)).listContainers(accountId));
}

export function loadPeople(workspaceId: string, integrationId: string, accountId: string): Promise<ExternalPerson[] | null> {
  return cached(`people:${integrationId}:${accountId}`, async () => connectorFor("clickup", await openIntegrationToken(workspaceId, integrationId)).listPeople(accountId));
}
