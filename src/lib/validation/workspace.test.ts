import { describe, expect, it } from "vitest";
import { inviteSchema, onboardingSchema, parseEmailList } from "./workspace";

describe("parseEmailList", () => {
  it("splits on commas, semicolons and whitespace and dedupes", () => {
    expect(parseEmailList("a@firma.de, B@firma.de;c@firma.de\nA@firma.de")).toEqual({
      valid: ["a@firma.de", "b@firma.de", "c@firma.de"],
      invalid: [],
    });
  });

  it("rejects freemail and malformed entries", () => {
    expect(parseEmailList("a@firma.de max@gmail.com kaputt")).toEqual({
      valid: ["a@firma.de"],
      invalid: ["max@gmail.com", "kaputt"],
    });
  });
});

describe("onboardingSchema", () => {
  const base = { name: "Firma GmbH", color: "#FF6B5B", template: "marketing" };

  it("accepts a valid form without invites", () => {
    expect(onboardingSchema.parse(base)).toEqual({ ...base, invites: [] });
  });

  it("rejects colors outside the palette", () => {
    expect(onboardingSchema.safeParse({ ...base, color: "#000000" }).success).toBe(false);
  });

  it("rejects freemail invites with the address in the message", () => {
    const r = onboardingSchema.safeParse({ ...base, invites: "max@gmx.de" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toContain("max@gmx.de");
  });
});

describe("inviteSchema", () => {
  it("requires at least one address", () => {
    expect(inviteSchema.safeParse({ emails: "  ", role: "member" }).success).toBe(false);
  });

  it("does not allow inviting owners", () => {
    expect(inviteSchema.safeParse({ emails: "a@firma.de", role: "owner" }).success).toBe(false);
  });
});
