import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createWorkspace, uniqueDomain } from "./helpers/auth";
import { waitForHydration } from "./helpers/hydration";

// Automated WCAG 2.1 AA checks (axe) on the main pages, light and dark (CLAUDE.md rule 5).
// Catches missing labels, contrast, landmarks; does not replace a manual keyboard pass.
// Reduced motion switches transitions off, so contrast is never measured mid-transition.

// 19 pages × axe: needs more than the default 60 s when the suite runs in parallel.
test.setTimeout(180_000);

const PAGES = ["", "/me", "/inbox", "/dashboard", "/p/MKT", "/p/MKT?view=board", "/p/MKT?t=MKT-1", "/p/MKT/settings", "/settings/members", "/settings/claude", "/settings/data", "/settings/data/import", "/settings/account"];

for (const scheme of ["light", "dark"] as const) {
  test(`axe: no WCAG A/AA violations (${scheme})`, async ({ browser }) => {
    const page = await (await browser.newContext({ colorScheme: scheme, reducedMotion: "reduce" })).newPage();
    const path = await createWorkspace(page, `axe@${uniqueDomain(`axe${scheme}`)}`, "Axe GmbH");
    const report: string[] = [];
    for (const sub of ["/", "/login", "/forgot-password", "/reset-password?token=e2e", "/impressum", "/datenschutz", "/agb", "/avv", "/umziehen", ...PAGES.map((p) => path + p)]) {
      await page.goto(sub);
      if (sub.startsWith(path)) await waitForHydration(page.getByRole("button", { name: /^Konto von/ }));
      const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      for (const v of violations) report.push(`${sub} – ${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
    }
    expect(report, report.join("\n")).toEqual([]);
  });
}
