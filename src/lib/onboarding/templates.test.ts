import { describe, expect, it } from "vitest";
import { MAX_DESCRIPTION, MAX_SUBTASKS, MAX_TITLE, PROJECT_KEY_PATTERN } from "@/lib/limits";
import { LOCALES } from "@/lib/i18n/locale";
import { DEFAULT_STATUSES } from "@/lib/project-templates";
import { PALETTE } from "@/lib/palette";
import { TEAM_TYPES, VIEWS } from "./options";
import { buildTemplate, MAX_TEMPLATE_TICKETS, TUTORIAL_LABEL } from "./templates";

const STATUS_COLORS = new Set([...DEFAULT_STATUSES.map((s) => s.color as string), ...Object.values(PALETTE)]);
const variants = TEAM_TYPES.flatMap((team) => LOCALES.flatMap((locale) => VIEWS.flatMap((view) => [true, false].map((invited) => ({ team, locale, view, invited })))));

describe("onboarding templates", () => {
  it.each(variants)("$team ($locale, $view, invited=$invited) stays within every limit", ({ team, locale, view, invited }) => {
    const tpl = buildTemplate(team, { locale, view, invited });
    expect(tpl.key).toMatch(PROJECT_KEY_PATTERN);
    expect(Object.values(PALETTE)).toContain(tpl.color);
    expect(tpl.name.length).toBeGreaterThan(0);
    expect(tpl.name.length).toBeLessThanOrEqual(100);
    expect([...new Intl.Segmenter("de", { granularity: "grapheme" }).segment(tpl.icon)]).toHaveLength(1);

    // Statuses: 3–4, names ≤ 50 and unique, one open and one done category, colors the editor offers.
    expect(tpl.statuses.length).toBeGreaterThanOrEqual(3);
    expect(new Set(tpl.statuses.map((s) => s.name)).size).toBe(tpl.statuses.length);
    for (const s of tpl.statuses) {
      expect(s.name.length).toBeLessThanOrEqual(50);
      expect(STATUS_COLORS.has(s.color)).toBe(true);
    }
    expect(tpl.statuses.some((s) => s.category === "open")).toBe(true);
    expect(tpl.statuses.some((s) => s.category === "done")).toBe(true);

    // Labels: unique per project (DB constraint), ≤ 50 characters, "Tutorial" included.
    expect(new Set(tpl.labels).size).toBe(tpl.labels.length);
    expect(tpl.labels).toContain(TUTORIAL_LABEL[locale]);
    for (const l of tpl.labels) expect(l.length).toBeLessThanOrEqual(50);

    // Tickets: limits from limits.ts, at most 5 subtasks, every label exists, all marked "Tutorial".
    expect(tpl.tickets.length).toBe(invited ? 4 : 5);
    expect(tpl.tickets.length).toBeLessThanOrEqual(MAX_TEMPLATE_TICKETS);
    for (const t of tpl.tickets) {
      expect(t.title.trim().length).toBeGreaterThan(0);
      expect(t.title.length).toBeLessThanOrEqual(MAX_TITLE);
      expect((t.description ?? "").length).toBeLessThanOrEqual(MAX_DESCRIPTION);
      expect(t.subtasks.length).toBeLessThanOrEqual(MAX_SUBTASKS);
      for (const st of t.subtasks) expect(st.length).toBeLessThanOrEqual(MAX_TITLE);
      expect(t.priority).toBeGreaterThanOrEqual(0);
      expect(t.priority).toBeLessThanOrEqual(4);
      expect(t.labels).toContain(TUTORIAL_LABEL[locale]);
      for (const l of t.labels) expect(tpl.labels).toContain(l);
    }
    expect(tpl.tickets.filter((t) => t.mine)).toHaveLength(1);
  });

  it("has the keys from docs/ONBOARDING.md §2.4", () => {
    expect(TEAM_TYPES.map((t) => buildTemplate(t, { locale: "de", view: "board", invited: false }).key)).toEqual(["MKT", "IT", "SUP", "OFF", "VTR", "DES", "DEV", "ALL"]);
  });

  it("matches the start view and the invite step", () => {
    const board = buildTemplate("support", { locale: "de", view: "board", invited: false });
    expect(board.tickets[1]?.title).toBe("Zieh mich nach „In Bearbeitung“ →");
    expect(buildTemplate("support", { locale: "de", view: "list", invited: false }).tickets[1]?.title).toBe("Ändere meinen Status per Klick");
    expect(board.tickets.map((t) => t.title)).toContain("Lade dein Team ein");
    expect(buildTemplate("support", { locale: "de", view: "board", invited: true }).tickets.map((t) => t.title)).not.toContain("Lade dein Team ein");
    expect(board.tickets[2]?.subtasks).toEqual(["Esc schließt", "↑/↓ springt zum nächsten Ticket", "Cmd/Ctrl+K öffnet die Palette"]);
  });

  it("speaks English for English users", () => {
    const tpl = buildTemplate("marketing", { locale: "en", view: "board", invited: true });
    expect(tpl.statuses.map((s) => s.name)).toEqual(["Open", "In progress", "Review", "Done"]);
    expect(tpl.tickets[0]?.title).toBe("Press C – and create your first own ticket");
    expect(tpl.tickets.at(-1)?.title).toBe("Plan the November newsletter");
  });
});
