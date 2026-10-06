// Cookieless page statistics: buffered counts are summed per day, path and referrer.
import { and, eq, like } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { flushPageViews, recordPageView } = await import("@/lib/pageviews");

const tag = `/test-${Date.now().toString(36)}`;

afterAll(async () => {
  await db.delete(schema.pageViewDaily).where(like(schema.pageViewDaily.path, `${tag}%`));
});

describe("page views", () => {
  it("adds buffered counts to existing rows on every flush", async () => {
    recordPageView(tag, "");
    recordPageView(tag, "");
    recordPageView(tag, "linkedin.com");
    await flushPageViews();
    recordPageView(tag, "");
    await flushPageViews();

    const rows = await db.select().from(schema.pageViewDaily).where(eq(schema.pageViewDaily.path, tag));
    const by = Object.fromEntries(rows.map((r) => [r.referrer, r.count]));
    expect(by).toEqual({ "": 3, "linkedin.com": 1 });
    expect(new Set(rows.map((r) => r.day)).size).toBe(1);
  });

  it("does nothing when the buffer is empty", async () => {
    await flushPageViews();
    const rows = await db.select().from(schema.pageViewDaily).where(and(eq(schema.pageViewDaily.path, `${tag}-none`)));
    expect(rows).toEqual([]);
  });
});
