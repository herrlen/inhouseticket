import { expect, test } from "@playwright/test";
import { createWorkspace, uniqueDomain } from "./helpers/auth";
import { waitForHydration } from "./helpers/hydration";

// Mobile review screenshots (390 px). On demand: SCREENSHOTS=1 pnpm exec playwright test e2e/mobile-shots.spec.ts
test.skip(!process.env.SCREENSHOTS, "only on demand");
test.setTimeout(240_000);
test.use({ launchOptions: { args: ["--lang=de-DE"] } });

const OUT = process.env.SHOT_DIR ?? "test-results/mobile";
const PAGES: Array<[string, string]> = [
  ["start", ""], ["me", "/me"], ["inbox", "/inbox"], ["dashboard", "/dashboard"], ["list", "/p/MKT"], ["board", "/p/MKT?view=board"],
  ["detail", "/p/MKT?t=MKT-1"], ["project-settings", "/p/MKT/settings"], ["members", "/settings/members"], ["claude", "/settings/claude"], ["data", "/settings/data"],
];

test("mobile screenshots", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "de-DE", hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const path = await createWorkspace(page, `mo@${uniqueDomain("mobileshots")}`, "Mobil GmbH");
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const [name, sub] of PAGES) {
      await page.goto(path + sub);
      await waitForHydration(page.getByRole("button", { name: /^Konto von/ }));
      await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 0) console.log(`OVERFLOW ${name} ${scheme}: ${overflow}px`);
      await page.screenshot({ path: `${OUT}/${name}-${scheme}.png`, fullPage: true });
    }
  }
  expect(true).toBe(true);
});
