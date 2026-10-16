import { describe, expect, it } from "vitest";
import * as limits from "./limits";

describe("limits", () => {
  it("match the product rules in CLAUDE.md", () => {
    expect(limits.MAX_USERS_PER_WORKSPACE).toBe(100);
    expect(limits.MAX_TITLE).toBe(500);
    expect(limits.MAX_DESCRIPTION).toBe(5000);
    expect(limits.MAX_SUBTASKS).toBe(5);
    expect(limits.MAX_ATTACHMENT_BYTES).toBe(102_400);
    expect(limits.ALLOWED_MIME).toEqual(["image/webp", "image/jpeg", "image/png"]);
  });

  it("passwords: at least 10, at most 128 characters", () => {
    expect(limits.MIN_PASSWORD).toBe(10);
    expect(limits.MAX_PASSWORD).toBe(128);
  });

  it("warns before the user limit is reached", () => {
    expect(limits.USER_WARNING_THRESHOLD).toBeLessThan(limits.MAX_USERS_PER_WORKSPACE);
  });

  it.each(["MKT", "IT", "OPS2", "ABCDEFGHIJ"])("accepts project key %s", (key) => {
    expect(limits.PROJECT_KEY_PATTERN.test(key)).toBe(true);
  });

  it.each(["", "M", "mkt", "1MK", "MK-T", "ABCDEFGHIJK"])("rejects project key %j", (key) => {
    expect(limits.PROJECT_KEY_PATTERN.test(key)).toBe(false);
  });
});
