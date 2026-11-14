import * as nodeCrypto from "node:crypto";
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { RateLimiter } from "../rate-limiter";
import { ClickUpConnector } from "./connector";
import { createFakeClickUp, sampleData } from "./fake";
import { CLICKUP_WEBHOOK_EVENTS, parseClickUpEvent, verifyClickUpSignature } from "./webhook";

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof nodeCrypto>();
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

// Invented secret and payload – the shape of ClickUp's signature example.
const SECRET = "FAKESECRET0123456789ABCDEFGHIJKLMNOP";
const body = '{"webhook_id":"7689a169-a000-4985-8676-6902b96d6627","event":"taskCreated","task_id":"c0j"}';
const sign = (b: string, s = SECRET) => createHmac("sha256", s).update(b).digest("hex");

describe("verifyClickUpSignature", () => {
  it("accepts the HMAC-SHA256 hex of the raw body (string or bytes, any hex case)", () => {
    expect(verifyClickUpSignature(body, sign(body), SECRET)).toBe(true);
    expect(verifyClickUpSignature(new TextEncoder().encode(body), sign(body), SECRET)).toBe(true);
    expect(verifyClickUpSignature(body, sign(body).toUpperCase(), SECRET)).toBe(true);
    expect(verifyClickUpSignature(body, ` ${sign(body)} `, SECRET)).toBe(true);
  });

  it("rejects missing, malformed, wrong and foreign signatures", () => {
    expect(verifyClickUpSignature(body, null, SECRET)).toBe(false);
    expect(verifyClickUpSignature(body, undefined, SECRET)).toBe(false);
    expect(verifyClickUpSignature(body, "", SECRET)).toBe(false);
    expect(verifyClickUpSignature(body, "f7bc83f430538424b13298e6aa6", SECRET)).toBe(false);
    expect(verifyClickUpSignature(body, sign(body).slice(0, 62) + "zz", SECRET)).toBe(false);
    expect(verifyClickUpSignature(body, sign(body, "another-secret-of-another-hook"), SECRET)).toBe(false);
    expect(verifyClickUpSignature(body, sign(body), "")).toBe(false);
  });

  it("rejects a body changed after signing – even only in whitespace (no re-serialising)", () => {
    const sig = sign(body);
    expect(verifyClickUpSignature(body.replace("c0j", "c0k"), sig, SECRET)).toBe(false);
    expect(verifyClickUpSignature(JSON.stringify(JSON.parse(body), null, 1), sig, SECRET)).toBe(false);
  });

  it("compares in constant time over the full digest", () => {
    const spy = vi.mocked(nodeCrypto.timingSafeEqual);
    spy.mockClear();
    verifyClickUpSignature(body, sign(body), SECRET);
    verifyClickUpSignature(body, "0".repeat(64), SECRET);
    expect(spy).toHaveBeenCalledTimes(2);
    for (const [a, b] of spy.mock.calls) {
      expect((a as Buffer).length).toBe(32);
      expect((b as Buffer).length).toBe(32);
    }
  });
});

describe("parseClickUpEvent", () => {
  const base = { webhook_id: "wh-1", task_id: "t-1" };
  it("maps task events to what the sync does", () => {
    expect(parseClickUpEvent({ ...base, event: "taskUpdated", history_items: [] })).toEqual({ webhookId: "wh-1", taskId: "t-1", kind: "task" });
    expect(parseClickUpEvent({ ...base, event: "taskMoved" })?.kind).toBe("task");
    expect(parseClickUpEvent({ ...base, event: "taskDeleted" })?.kind).toBe("deleted");
    expect(parseClickUpEvent({ ...base, event: "taskCommentPosted" })?.kind).toBe("comment");
    expect(parseClickUpEvent({ ...base, event: "taskCommentUpdated" })?.kind).toBe("comment");
  });

  it("ignores other events and malformed payloads", () => {
    expect(parseClickUpEvent({ ...base, event: "listCreated" })).toBeNull();
    expect(parseClickUpEvent({ ...base, event: "taskTimeTrackedUpdated" })).toBeNull();
    expect(parseClickUpEvent({ event: "taskUpdated", webhook_id: "wh-1" })).toBeNull();
    expect(parseClickUpEvent({ event: "taskUpdated", task_id: "t-1" })).toBeNull();
    expect(parseClickUpEvent({ ...base, event: "taskUpdated", task_id: "x".repeat(101) })).toBeNull();
    expect(parseClickUpEvent(null)).toBeNull();
    expect(parseClickUpEvent([base])).toBeNull();
    expect(parseClickUpEvent("taskUpdated")).toBeNull();
  });
});

describe("ClickUp webhook API (fake)", () => {
  const data = sampleData();
  const fake = createFakeClickUp(data);
  const connector = new ClickUpConnector({ token: data.token, fetch: fake.fetch, limiter: new RateLimiter(10_000) });

  it("registers with the task events, lists health and removes", async () => {
    const hook = await connector.webhooks.create("9001", "https://app.example/api/integrations/clickup/webhook/x");
    expect(hook.id).toMatch(/^wh-/);
    expect(hook.secret).toMatch(/^FAKESECRET/);
    expect(fake.webhooks[0]).toMatchObject({ endpoint: "https://app.example/api/integrations/clickup/webhook/x", events: [...CLICKUP_WEBHOOK_EVENTS], spaceId: null });
    expect(fake.log.at(-1)).toBe("POST /api/v2/team/9001/webhook");

    fake.webhooks[0]!.status = "failing";
    fake.webhooks[0]!.failCount = 5;
    expect(await connector.webhooks.list("9001")).toEqual([{ id: hook.id, endpoint: "https://app.example/api/integrations/clickup/webhook/x", status: "failing", failCount: 5 }]);

    await connector.webhooks.remove(hook.id);
    expect(fake.webhooks).toHaveLength(0);
    // Already gone: no error.
    await connector.webhooks.remove(hook.id);
  });

  it("narrows to one space only for numeric space ids", async () => {
    await connector.webhooks.create("9001", "https://app.example/h", { spaceId: "90150" });
    expect(fake.webhooks.at(-1)?.spaceId).toBe(90150);
    await connector.webhooks.create("9001", "https://app.example/h", { spaceId: "s-1" });
    expect(fake.webhooks.at(-1)?.spaceId).toBeNull();
  });

  it("reads one task, null when it is gone", async () => {
    expect(await connector.getTask("t-2")).toMatchObject({ id: "t-2", title: "Texte schreiben", parentId: "t-1", spaceId: "s-1", listId: "l-1" });
    expect(await connector.getTask("t-404")).toBeNull();
  });
});
