import { describe, expect, it, vi } from "vitest";
import { isoWeek } from "@/components/dashboard/charts";
import { relativeTime } from "./relative-time";

vi.mock("server-only", () => ({}));

describe("isoWeek", () => {
  it.each([
    ["2026-01-01", 1], // Thursday
    ["2026-10-05", 41],
    ["2026-12-31", 53],
    ["2027-01-04", 1],
    ["2021-01-03", 53], // Sunday belongs to the last week of 2020
  ])("%s → KW %i", (date, week) => {
    expect(isoWeek(date)).toBe(week);
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-10-07T12:00:00Z");
  it.each([
    ["2026-10-07T11:59:30Z", "vor 30 Sekunden"],
    ["2026-10-07T11:55:00Z", "vor 5 Minuten"],
    ["2026-10-07T09:00:00Z", "vor 3 Stunden"],
    ["2026-10-06T12:00:00Z", "gestern"],
  ])("%s → %s", (iso, text) => {
    expect(relativeTime(iso, now)).toBe(text);
  });
});

describe("digest lines", () => {
  it("describe each notification type in German", async () => {
    const { describeNotification } = await import("./notification-text");
    const base = { actor: "Lea", key: "MKT-3", title: "Banner", payload: {} };
    expect(describeNotification({ ...base, type: "assigned" })).toBe("Lea hat dir MKT-3 „Banner“ zugewiesen");
    expect(describeNotification({ ...base, type: "status", payload: { to: "Review" } })).toBe("Lea hat MKT-3 „Banner“ auf „Review“ gesetzt");
    expect(describeNotification({ ...base, actor: null, type: "due_tomorrow" })).toBe("MKT-3 „Banner“ ist morgen fällig");
  });
});
