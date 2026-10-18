import { expect, test, type Page } from "@playwright/test";
import { createWorkspace, uniqueDomain } from "./helpers/auth";
import { waitForHydration } from "./helpers/hydration";
import { ticketSaved } from "./helpers/saved";

// Keyboard-only use (CLAUDE.md rule 5): every tab stop shows a focus indicator, and the core flow
// – skip link, create, open, change, close – works without a mouse.

/** Tabs through the page and returns the tab stops without a visible focus indicator. */
async function tabStopsWithoutFocusRing(page: Page, maxStops: number) {
  const missing: string[] = [];
  await page.locator("body").focus();
  for (let i = 0; i < maxStops; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body || el.closest("nextjs-portal")) return null; // dev tools only
      // Focus inside a native control's own shadow parts (e.g. the calendar button of a date
      // input): the browser draws its ring there, the host itself is not :focus.
      if (!el.matches(":focus") && el.matches(":focus-within")) return null;
      const shows = (n: Element) => {
        const s = getComputedStyle(n);
        return (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || (s.boxShadow !== "none" && s.boxShadow !== "");
      };
      // The ring may sit on a wrapper via :focus-within (e.g. the quick-add field).
      let ring = false;
      for (let n: Element | null = el, i = 0; n && i < 3 && !ring; n = n.parentElement, i++) ring = shows(n);
      const name = el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 40) ?? el.tagName;
      return { ring, name: `${el.tagName.toLowerCase()} „${name}“` };
    });
    if (info && !info.ring) missing.push(info.name);
  }
  return [...new Set(missing)];
}

test("every tab stop on the main pages shows a focus ring", async ({ page }) => {
  const path = await createWorkspace(page, `kb@${uniqueDomain("focus")}`, "Fokus GmbH");
  const report: string[] = [];
  for (const sub of ["/p/MKT", "/p/MKT?view=board", "/dashboard", "/settings/claude"]) {
    await page.goto(path + sub);
    await waitForHydration(page.getByRole("button", { name: /^Konto von/ }));
    for (const m of await tabStopsWithoutFocusRing(page, 45)) report.push(`${sub}: ${m}`);
  }
  for (const sub of ["/", "/login"]) {
    await page.context().clearCookies();
    await page.goto(sub);
    for (const m of await tabStopsWithoutFocusRing(page, 15)) report.push(`${sub}: ${m}`);
  }
  expect(report, report.join("\n")).toEqual([]);
});

test("core flow with the keyboard only: skip link, create, open, change priority, close", async ({ page }) => {
  const path = await createWorkspace(page, `kb@${uniqueDomain("kbflow")}`, "Tastatur GmbH");
  await page.goto(`${path}/p/MKT`);
  const quick = page.getByRole("textbox", { name: /Neues Ticket/ });
  await waitForHydration(quick);

  // The first tab stop is the skip link; it moves focus into the main area.
  await page.locator("body").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Zum Inhalt springen" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);

  // C focuses quick add; Enter creates.
  await page.keyboard.press("c");
  await expect(quick).toBeFocused();
  await page.keyboard.type("Per Tastatur angelegt");
  await Promise.all([ticketSaved(page), page.keyboard.press("Enter")]);
  const open = page.getByRole("button", { name: /^MKT-6 öffnen/ });
  await expect(open).toBeVisible();

  // Open with Enter, set priority with a digit, close with Escape – focus returns to the row.
  await open.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("heading", { name: "Unteraufgaben" }).click(); // move focus off the title field
  await Promise.all([ticketSaved(page), page.keyboard.press("1")]); // 1 = Dringend … 4 = Niedrig
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(open).toBeFocused();
  await expect(page.getByRole("button", { name: "Priorität von MKT-6: Dringend" })).toBeVisible();
});
