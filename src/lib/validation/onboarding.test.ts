import { describe, expect, it } from "vitest";
import { MAX_SOURCE_OTHER } from "@/lib/limits";
import { PREVIOUS_TOOLS } from "@/lib/onboarding/options";
import { PALETTE } from "@/lib/palette";
import { inviteStepSchema, isTimeZone, profileStepSchema, questionsStepSchema, teamStepSchema, viewStepSchema, workspaceStepSchema } from "./onboarding";

const workspaceId = "6f1c2a43-1b6e-4c3d-9f0e-2a1b3c4d5e6f";

describe("profileStepSchema", () => {
  it("accepts a name and an IANA zone", () => {
    expect(profileStepSchema.parse({ name: "  Lea Owner ", timezone: "America/New_York" })).toEqual({ name: "Lea Owner", timezone: "America/New_York" });
  });

  it.each(["Mars/Olympus", "", "x".repeat(65)])("rejects zone %j", (timezone) => {
    expect(profileStepSchema.safeParse({ name: "Lea", timezone }).success).toBe(false);
  });

  it("rejects an empty name", () => {
    expect(profileStepSchema.safeParse({ name: " ", timezone: "UTC" }).success).toBe(false);
  });

  it("isTimeZone never throws", () => {
    expect(isTimeZone("Europe/Berlin")).toBe(true);
    expect(isTimeZone("nope")).toBe(false);
  });
});

describe("workspaceStepSchema", () => {
  it("needs a palette color and a boolean auto-join", () => {
    expect(workspaceStepSchema.safeParse({ name: "Ursalz", color: PALETTE.mint, autoJoin: true }).success).toBe(true);
    expect(workspaceStepSchema.safeParse({ name: "Ursalz", color: "#000000", autoJoin: true }).success).toBe(false);
    expect(workspaceStepSchema.safeParse({ name: "Ursalz", color: PALETTE.mint, autoJoin: "on" }).success).toBe(false);
  });
});

describe("enum steps", () => {
  it("team type and view come from fixed lists", () => {
    expect(teamStepSchema.safeParse({ workspaceId, teamType: "marketing" }).success).toBe(true);
    expect(teamStepSchema.safeParse({ workspaceId, teamType: "hr" }).success).toBe(false);
    expect(viewStepSchema.safeParse({ workspaceId, view: "board" }).success).toBe(true);
    expect(viewStepSchema.safeParse({ workspaceId, view: "gantt" }).success).toBe(false);
    expect(viewStepSchema.safeParse({ workspaceId: "nope", view: "list" }).success).toBe(false);
  });
});

describe("questionsStepSchema", () => {
  it("deduplicates tools and keeps the free text only for 'other'", () => {
    expect(questionsStepSchema.parse({ workspaceId, previousTools: ["jira", "jira", "excel"], source: "linkedin", sourceOther: "Messe" })).toEqual({
      workspaceId, previousTools: ["jira", "excel"], source: "linkedin", sourceOther: null,
    });
    expect(questionsStepSchema.parse({ workspaceId, previousTools: [], source: "other", sourceOther: " Messe " }).sourceOther).toBe("Messe");
  });

  it("refuses unknown values and overlong text", () => {
    expect(questionsStepSchema.safeParse({ workspaceId, previousTools: ["excel", "basecamp"], source: null }).success).toBe(false);
    expect(questionsStepSchema.safeParse({ workspaceId, previousTools: [], source: "tv" }).success).toBe(false);
    expect(questionsStepSchema.safeParse({ workspaceId, previousTools: [], source: "other", sourceOther: "x".repeat(MAX_SOURCE_OTHER + 1) }).success).toBe(false);
    expect(questionsStepSchema.safeParse({ workspaceId, previousTools: [...PREVIOUS_TOOLS, "excel"], source: null }).success).toBe(false);
  });
});

describe("inviteStepSchema", () => {
  it("caps one step at 50 addresses", () => {
    expect(inviteStepSchema.safeParse({ workspaceId, emails: Array.from({ length: 50 }, (_, i) => `p${i}@firma.de`) }).success).toBe(true);
    expect(inviteStepSchema.safeParse({ workspaceId, emails: Array.from({ length: 51 }, (_, i) => `p${i}@firma.de`) }).success).toBe(false);
  });
});
