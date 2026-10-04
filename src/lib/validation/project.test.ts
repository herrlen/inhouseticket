import { describe, expect, it } from "vitest";
import { suggestProjectKey } from "@/lib/project-key";
import { createProjectSchema, projectIconSchema } from "./project";

describe("suggestProjectKey", () => {
  it.each([
    ["Marketing", "MAR"],
    ["Kampagne Q4", "KQ"],
    ["Social Media Team", "SMT"],
    ["Öffentlichkeit", "OEF"],
    ["IT", "IT"],
    ["X", "XPR"],
    ["2026 Planung", "P"],
  ])("%j → %j", (name, key) => {
    const k = suggestProjectKey(name);
    if (key === "P") expect(k).toMatch(/^[A-Z][A-Z0-9]{1,9}$/);
    else expect(k).toBe(key);
  });
});

describe("projectIconSchema", () => {
  it.each(["📣", "👩🏽‍💻", "🇩🇪", ""])("accepts %j", (icon) => {
    expect(projectIconSchema.safeParse(icon).success).toBe(true);
  });

  it.each(["ab", "📣📣", "<b>"])("rejects %j", (icon) => {
    expect(projectIconSchema.safeParse(icon).success).toBe(false);
  });
});

describe("createProjectSchema", () => {
  it("uppercases the key and maps empty folder/icon to null", () => {
    expect(createProjectSchema.parse({ name: "IT", key: "it", color: "#3A86FF" })).toEqual({
      name: "IT",
      key: "IT",
      color: "#3A86FF",
      icon: null,
      folderId: null,
    });
  });

  it("rejects invalid keys", () => {
    expect(createProjectSchema.safeParse({ name: "IT", key: "1T", color: "#3A86FF" }).success).toBe(false);
    expect(createProjectSchema.safeParse({ name: "IT", key: "I-T", color: "#3A86FF" }).success).toBe(false);
  });
});

describe("statusSchema wipLimit", () => {
  const base = { name: "In Arbeit", color: "#3B82F6", category: "active" };
  it("maps empty to null and coerces numbers", async () => {
    const { statusSchema } = await import("./project");
    expect(statusSchema.parse(base).wipLimit).toBeNull();
    expect(statusSchema.parse({ ...base, wipLimit: "3" }).wipLimit).toBe(3);
    expect(statusSchema.safeParse({ ...base, wipLimit: "0" }).success).toBe(false);
    expect(statusSchema.safeParse({ ...base, wipLimit: "2.5" }).success).toBe(false);
  });
});
