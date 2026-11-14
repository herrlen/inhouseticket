import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { describeNotification } from "@/lib/notification-text";
import { parseQuickAdd } from "@/lib/quick-add";
import { relativeTime } from "@/lib/relative-time";
import { formatDue, groupTickets } from "@/components/tickets/list-model";
import { de } from "./de";
import { en } from "./en";
import { intlLocale, isLocale } from "./locale";

/** All leaf paths of a message object (functions count as leaves). */
function paths(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  if (Array.isArray(value)) return [`${prefix}[]`];
  return Object.entries(value).flatMap(([k, v]) => paths(v, prefix ? `${prefix}.${k}` : k));
}

describe("messages", () => {
  it("en has exactly the keys of de", () => {
    expect(paths(en).sort()).toEqual(paths(de).sort());
  });

  it("arrays have the same length (FAQ, features, steps …)", () => {
    const arrays = (v: unknown, p = ""): Array<[string, number]> =>
      typeof v !== "object" || v === null
        ? []
        : Array.isArray(v)
          ? [[p, v.length]]
          : Object.entries(v).flatMap(([k, x]) => arrays(x, `${p}.${k}`));
    expect(arrays(en)).toEqual(arrays(de));
  });

  it.each([
    ["de", de],
    ["en", en],
  ] as const)("shell page labels match the pages' own titles (%s)", (_, m) => {
    expect(m.shell.pages).toEqual({
      dashboard: m.dashboard.title,
      members: m.members.title,
      admin: m.admin.title,
      account: m.account.title,
      claude: m.claude.title,
      claudeNav: m.claude.navLabel,
      data: m.data.title,
      dataNav: m.data.navLabel,
      import: m.import.title,
      integrations: m.integrations.title,
    });
  });

  it("legal note only in English", () => {
    expect(de.legal.germanOnly).toBe("");
    expect(en.legal.germanOnly).toMatch(/German/);
  });
});

describe("locale", () => {
  it("accepts only de and en", () => {
    expect(isLocale("de")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it("maps to Intl tags", () => {
    expect(intlLocale("de")).toBe("de-DE");
    expect(intlLocale("en")).toBe("en-GB");
  });
});

describe("validation messages", () => {
  // Every German message in the Zod schemas has an English translation.
  const dir = "src/lib/validation";
  const sources = readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.includes(".test."))
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .concat(readFileSync("src/app/(app)/[workspace]/ticket-actions.ts", "utf8"));
  const literals = sources.flatMap((s) => [...s.matchAll(/"([A-ZÄÖÜ0-9][^"]*\.)"/g)].map((m) => m[1]!));

  it.each([...new Set(literals)])("%s", (message) => {
    expect(en.validation(message)).not.toBe(message);
    expect(de.validation(message)).toBe(message);
  });

  it("translates messages with numbers", () => {
    expect(en.validation("Höchstens 500 Zeichen.")).toBe("At most 500 characters.");
    expect(en.validation("Höchstens 20 Adressen auf einmal.")).toBe("At most 20 addresses at once.");
    expect(en.validation("Keine gültige Firmen-E-Mail: a@gmail.com")).toBe("Not a valid company email: a@gmail.com");
    expect(en.validation("something unknown")).toBe("something unknown");
  });
});

describe("locale-aware helpers", () => {
  const members = [{ id: "u1", name: "Max Mustermann" }];
  const today = "2026-10-07"; // Wednesday

  it("quick add understands English date words and labels in English", () => {
    const r = parseQuickAdd("Banner @max !high ^friday", { members, today, locale: "en" });
    expect(r).toMatchObject({ title: "Banner", assigneeId: "u1", priority: 3, dueDate: "2026-10-09" });
    expect(r.tokens.find((x) => x.kind === "priority")?.label).toBe("High");
    expect(parseQuickAdd("x ^tomorrow", { members, today }).dueDate).toBe("2026-10-08");
    expect(parseQuickAdd("x ^next-week", { members, today }).dueDate).toBe("2026-10-12");
    expect(parseQuickAdd("x !hoch", { members, today }).tokens[0]?.label).toBe("Hoch");
  });

  it("formats due dates and relative times per locale", () => {
    expect(formatDue("2026-10-09")).toBe("09.10.");
    expect(formatDue("2026-10-09", "en")).toBe("09/10");
    const now = Date.parse("2026-10-07T12:00:00Z");
    expect(relativeTime("2026-10-06T12:00:00Z", now, "en")).toBe("yesterday");
    expect(relativeTime("2026-10-06T12:00:00Z", now)).toBe("gestern");
  });

  it("groups and notifications use the given messages", () => {
    const g = groupTickets([], { groupBy: "none", sortBy: "manual", statuses: [], members: [], today, t: en });
    expect(g[0]?.label).toBe("All tickets");
    const line = { type: "assigned", actor: "Anna", key: "WEB-1", title: "Hero", payload: {} };
    expect(describeNotification(line, en)).toBe("Anna assigned WEB-1 “Hero” to you");
    expect(describeNotification(line)).toBe("Anna hat dir WEB-1 „Hero“ zugewiesen");
  });
});
