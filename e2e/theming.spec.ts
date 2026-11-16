import { expect, test, type Page } from "@playwright/test";
import { createWorkspace, uniqueDomain } from "./helpers/auth";
import { waitForHydration } from "./helpers/hydration";

// Darstellung (Redesign X3, like emuchat): workspace default by an admin, own colors over it, reset.

const domain = uniqueDomain("theming");
const accent = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim());

test("workspace default, own colors over it, reset back to the default", async ({ page }) => {
  const path = await createWorkspace(page, `tara@${domain}`, "Farbwerk GmbH");
  const emu = await accent(page);
  expect(emu).toBe("#9a4a16");

  await page.goto(`${path}/settings/appearance`);
  await expect(page.getByRole("heading", { name: "Darstellung", level: 1 })).toBeVisible();
  await waitForHydration(page.getByRole("button", { name: "Speichern" }).last());

  // Workspace default: Ozean.
  const workspace = page.getByRole("region", { name: "Für alle im Workspace" });
  await workspace.getByText("Ozean", { exact: true }).click();
  await workspace.getByRole("button", { name: "Speichern" }).click();
  await expect(workspace.getByRole("status").filter({ hasText: "Gespeichert." })).toBeVisible();
  await expect.poll(() => accent(page)).toBe("#1d5fa8");

  // Own colors win over the workspace default – here a too-light accent the engine corrects.
  const mine = page.getByRole("region", { name: "Für mich" });
  await mine.getByLabel("Akzent", { exact: true }).fill("#ffee00");
  await expect(mine.getByText("Angepasst für die Lesbarkeit: Akzent.")).toBeVisible();
  await mine.getByRole("button", { name: "Speichern" }).click();
  await expect(mine.getByRole("status").filter({ hasText: "Gespeichert." })).toBeVisible();
  await expect.poll(() => accent(page)).not.toBe("#1d5fa8");
  const own = await accent(page);
  expect(own).not.toBe("#ffee00");

  // Survives a reload (rendered on the server, no flash of the default colors).
  await page.reload();
  expect(await accent(page)).toBe(own);

  // Reset: back to the workspace default.
  await page.getByRole("region", { name: "Für mich" }).getByRole("button", { name: "Auf Workspace-Standard zurücksetzen" }).click();
  await expect.poll(() => accent(page)).toBe("#1d5fa8");

  // Workspace back to Emu.
  await page.getByRole("region", { name: "Für alle im Workspace" }).getByRole("button", { name: "Auf Emu zurücksetzen" }).click();
  await expect.poll(() => accent(page)).toBe(emu);
});
