import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: {} }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));

const { safeNext } = await import("./session");

describe("safeNext", () => {
  it.each([
    ["/firma/settings", "/firma/settings"],
    ["/invite/abc", "/invite/abc"],
    [undefined, "/start"],
    ["https://evil.example", "/start"],
    ["//evil.example", "/start"],
    ["/\\evil.example", "/start"],
    ["javascript:alert(1)", "/start"],
  ])("%j → %j", (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});
