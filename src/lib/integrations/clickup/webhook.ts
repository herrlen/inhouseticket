// ClickUp webhooks (API v2, checked against developer.clickup.com on 14.11.2026):
//   POST   /team/{team_id}/webhook  { endpoint, events, space_id? } → { id, webhook: { id, secret, health } }
//   GET    /team/{team_id}/webhook  → { webhooks: [{ id, endpoint, health: { status, fail_count } }] }
//                                    (only the webhooks of the calling token)
//   DELETE /webhook/{webhook_id}    → {}
// Every event is a POST with JSON `{ event, task_id, webhook_id, history_items? }`, signed in the
// header `X-Signature`: HMAC-SHA256 of the body with the webhook secret, hex. ClickUp counts a
// non-2xx answer or one slower than 7 s as failed (5 tries per event, then the event is dropped);
// 100 failures – or a single 401/410 – suspend the webhook.
// Framework-free (node:crypto only) like the rest of src/lib/integrations.

import { createHmac, timingSafeEqual } from "node:crypto";
import type { WebhookEvent } from "../types";

/** Task events the sync needs (read-only: everything leads to re-reading one task). */
export const CLICKUP_WEBHOOK_EVENTS = [
  "taskCreated",
  "taskUpdated",
  "taskDeleted",
  "taskMoved",
  "taskStatusUpdated",
  "taskAssigneeUpdated",
  "taskPriorityUpdated",
  "taskDueDateUpdated",
  "taskTagUpdated",
  "taskCommentPosted",
  "taskCommentUpdated",
] as const;

const COMMENT_EVENTS = new Set(["taskCommentPosted", "taskCommentUpdated"]);
const KNOWN_EVENTS = new Set<string>(CLICKUP_WEBHOOK_EVENTS);
const SIGNATURE = /^[0-9a-f]{64}$/i;

/**
 * True when `signature` (the X-Signature header) is the HMAC-SHA256 of exactly these body bytes.
 * Constant time over the digest; a missing, malformed or wrong-length header is simply false.
 */
export function verifyClickUpSignature(body: Uint8Array | string, signature: string | null | undefined, secret: string): boolean {
  if (!secret || !signature) return false;
  const given = signature.trim();
  if (!SIGNATURE.test(given)) return false;
  const expected = createHmac("sha256", secret).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(given, "hex"));
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

/** The event of a verified body, or null when it is not one the sync acts on (other events, no task). */
export function parseClickUpEvent(payload: unknown): WebhookEvent | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const o = payload as Record<string, unknown>;
  const event = str(o.event);
  const taskId = str(o.task_id);
  const webhookId = str(o.webhook_id);
  if (!KNOWN_EVENTS.has(event) || !taskId || taskId.length > 100 || !webhookId) return null;
  return { webhookId, taskId, kind: event === "taskDeleted" ? "deleted" : COMMENT_EVENTS.has(event) ? "comment" : "task" };
}
