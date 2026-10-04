import { describe, expect, it } from "vitest";
import { MAX_DESCRIPTION, MAX_TITLE } from "@/lib/limits";
import { bulkPatchSchema, dueDateSchema, dueDateToTimestamp, ticketPatchSchema, timestampToDueDate } from "./ticket";

describe("ticketPatchSchema", () => {
  it(`enforces the title limit of ${MAX_TITLE}`, () => {
    expect(ticketPatchSchema.safeParse({ title: "x".repeat(MAX_TITLE) }).success).toBe(true);
    expect(ticketPatchSchema.safeParse({ title: "x".repeat(MAX_TITLE + 1) }).success).toBe(false);
    expect(ticketPatchSchema.safeParse({ title: "   " }).success).toBe(false);
  });

  it(`enforces the description limit of ${MAX_DESCRIPTION} and maps blank to null`, () => {
    expect(ticketPatchSchema.safeParse({ description: "x".repeat(MAX_DESCRIPTION + 1) }).success).toBe(false);
    expect(ticketPatchSchema.parse({ description: "  " })).toEqual({ description: null });
  });

  it("rejects empty patches and priorities outside 0–4", () => {
    expect(ticketPatchSchema.safeParse({}).success).toBe(false);
    expect(ticketPatchSchema.safeParse({ priority: 5 }).success).toBe(false);
  });
});

describe("bulkPatchSchema", () => {
  it("allows exactly one field", () => {
    expect(bulkPatchSchema.safeParse({ priority: 3 }).success).toBe(true);
    expect(bulkPatchSchema.safeParse({ priority: 3, assigneeId: null }).success).toBe(false);
  });
});

describe("due dates", () => {
  it.each(["2026-10-04", null])("accepts %j", (d) => {
    expect(dueDateSchema.safeParse(d).success).toBe(true);
  });

  it.each(["2026-02-30", "04.10.2026", "2026-1-4"])("rejects %j", (d) => {
    expect(dueDateSchema.safeParse(d).success).toBe(false);
  });

  it("round-trips through the stored timestamp without timezone drift", () => {
    expect(timestampToDueDate(dueDateToTimestamp("2026-03-29"))).toBe("2026-03-29");
    expect(timestampToDueDate(null)).toBeNull();
  });
});
