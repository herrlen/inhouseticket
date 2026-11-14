import { after } from "next/server";
import { enqueueWebhookEvent, requestDeltaSync, webhookReceiver } from "@/db/queries/integration-webhooks";
import { jsonError } from "@/lib/api";
import { readBodyLimited } from "@/lib/body";
import { parseClickUpEvent, verifyClickUpSignature } from "@/lib/integrations/clickup/webhook";
import { processWebhookEvents } from "@/lib/integrations/webhook-sync";
import { MAX_WEBHOOK_BODY_BYTES, WEBHOOK_EVENTS_PER_MINUTE } from "@/lib/limits";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/registration";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ integrationId: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Unsigned/wrong requests per address and minute (ClickUp has no fixed addresses to allow). */
const UNVERIFIED_PER_MINUTE = 120;
const notFound = () => jsonError(404, "not_found", "Nicht gefunden.");
const ok = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

/**
 * ClickUp webhook (ADR 008, addendum webhooks). No session and no same-origin check – the caller
 * is ClickUp; the signature over the raw body (X-Signature, HMAC-SHA256 with the per-webhook
 * secret) is the only credential and is checked before anything is parsed. Unknown, disconnected
 * or webhook-less integrations are one and the same 404. Answers within milliseconds (ClickUp
 * gives 7 s): the event is queued and the task read after the response, under the sync lease.
 */
export async function POST(request: Request, { params }: Ctx) {
  const { integrationId } = await params;
  if (!UUID.test(integrationId)) return notFound();
  // Only failed requests count, per address and integration (ClickUp's shared senders must not be
  // blocked for everyone by one stale webhook); over the limit (peek: cost 0 against limit − 1),
  // a request is turned away before the body is read or the database asked.
  const ipKey = `webhook-ip:${integrationId}:${clientIp(request.headers) || "unknown"}`;
  if (!rateLimit(ipKey, UNVERIFIED_PER_MINUTE - 1, 60_000, Date.now(), 0).ok) return jsonError(429, "rate_limited", "Zu viele Anfragen.");

  const body = await readBodyLimited(request, MAX_WEBHOOK_BODY_BYTES);
  if (body === "too_large") return jsonError(413, "too_large", "Zu groß.");
  const target = await webhookReceiver(integrationId);
  if (!target) {
    rateLimit(ipKey, UNVERIFIED_PER_MINUTE, 60_000);
    return notFound();
  }
  if (!verifyClickUpSignature(body, request.headers.get("x-signature"), target.webhook.secret)) {
    rateLimit(ipKey, UNVERIFIED_PER_MINUTE, 60_000);
    return jsonError(401, "bad_signature", "Signatur ungültig.");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return jsonError(400, "bad_json", "Ungültiger Inhalt.");
  }
  const event = parseClickUpEvent(payload);
  // Events the sync does not act on, or from an older webhook of this integration: accepted, ignored.
  if (!event || event.webhookId !== target.webhook.id) return ok();

  // A flood (bulk edit of thousands of tasks) becomes one delta sync instead of single reads.
  if (!rateLimit(`webhook:${target.integrationId}`, WEBHOOK_EVENTS_PER_MINUTE, 60_000).ok) {
    await requestDeltaSync(target);
    return ok();
  }
  const queued = await enqueueWebhookEvent(target, { taskId: event.taskId, kind: event.kind });
  if (queued === "queued") {
    after(() =>
      processWebhookEvents(target.integrationId).catch((e: unknown) => console.error("integration webhook: background batch failed", e instanceof Error ? e.message.slice(0, 80) : "unknown")),
    );
  }
  return ok();
}
