import { describe, expect, it } from "vitest";
import { MAX_NAME, MAX_PASSWORD, MIN_PASSWORD } from "@/lib/limits";
import { confirmRegistrationSchema, registerSchema } from "./registration";

const ok = { name: "  Nora Schmidt ", email: " Nora@Firma.DE ", password: "lang-genug-123", confirm: "lang-genug-123" };

describe("registerSchema", () => {
  it("trims the name and normalizes the address, keeps the password as typed", () => {
    const parsed = registerSchema.parse({ ...ok, password: " lang-genug-123", confirm: " lang-genug-123" });
    expect(parsed).toMatchObject({ name: "Nora Schmidt", email: "nora@firma.de", password: " lang-genug-123" });
  });

  it("requires a name within the limit and without control characters", () => {
    expect(registerSchema.safeParse({ ...ok, name: "   " }).success).toBe(false);
    expect(registerSchema.safeParse({ ...ok, name: "x".repeat(MAX_NAME) }).success).toBe(true);
    expect(registerSchema.safeParse({ ...ok, name: "x".repeat(MAX_NAME + 1) }).success).toBe(false);
    expect(registerSchema.safeParse({ ...ok, name: "Nora‮evil" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...ok, name: "Nora\u0000" }).success).toBe(false);
  });

  it("rejects malformed addresses", () => {
    for (const email of ["nora", "nora@", "@firma.de", "nora@firma", `${"x".repeat(250)}@firma.de`]) {
      expect(registerSchema.safeParse({ ...ok, email }).success, email).toBe(false);
    }
  });

  it("applies the password policy from limits.ts and needs the repetition to match", () => {
    expect(registerSchema.safeParse({ ...ok, password: "x".repeat(MIN_PASSWORD - 1), confirm: "x".repeat(MIN_PASSWORD - 1) }).success).toBe(false);
    expect(registerSchema.safeParse({ ...ok, password: "x".repeat(MAX_PASSWORD + 1), confirm: "x".repeat(MAX_PASSWORD + 1) }).success).toBe(false);
    const mismatch = registerSchema.safeParse({ ...ok, confirm: "anders-123456" });
    expect(mismatch.success).toBe(false);
    expect(mismatch.error?.issues[0]?.path).toEqual(["confirm"]);
  });
});

describe("confirmRegistrationSchema", () => {
  it("accepts a link token and a password", () => {
    expect(confirmRegistrationSchema.safeParse({ token: "A".repeat(43), password: "irgendwas" }).success).toBe(true);
  });

  it("rejects tokens that cannot be ours and empty or oversized passwords", () => {
    expect(confirmRegistrationSchema.safeParse({ token: "kurz", password: "x" }).success).toBe(false);
    expect(confirmRegistrationSchema.safeParse({ token: `${"A".repeat(43)}?x=1`, password: "x" }).success).toBe(false);
    expect(confirmRegistrationSchema.safeParse({ token: "A".repeat(43), password: "" }).success).toBe(false);
    expect(confirmRegistrationSchema.safeParse({ token: "A".repeat(43), password: "x".repeat(MAX_PASSWORD + 1) }).success).toBe(false);
  });
});
