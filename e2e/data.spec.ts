import { expect, test } from "@playwright/test";
import { createWorkspace, uniqueDomain } from "./helpers/auth";
import { waitForHydration } from "./helpers/hydration";

test("export as JSON and CSV, then the owner deletes the workspace", async ({ page, browser }) => {
  const domain = uniqueDomain("data");
  const path = await createWorkspace(page, `ina@${domain}`, "Daten GmbH");
  const slug = path.slice(1);
  await page.goto(`${path}/settings/data`);
  await expect(page.getByRole("heading", { name: "Daten & Workspace" })).toBeVisible();

  const [json] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "JSON herunterladen" }).click()]);
  expect(json.suggestedFilename()).toMatch(new RegExp(`^inhouseticket-${slug}-\\d{4}-\\d{2}-\\d{2}\\.json$`));
  const data = JSON.parse(await (await json.createReadStream()).toArray().then((c) => Buffer.concat(c).toString("utf8")));
  expect(data.format).toBe("inhouseticket-export");
  expect(data.workspace.name).toBe("Daten GmbH");
  expect(data.members).toEqual([expect.objectContaining({ email: `ina@${domain}`, role: "owner" })]);
  expect(data.projects[0].key).toBe("MKT");
  expect(data.projects[0].statuses.map((s: { name: string }) => s.name)).toEqual(["Offen", "In Arbeit", "Review", "Erledigt"]);
  // The five tutorial tickets from the onboarding wizard.
  expect(data.projects[0].tickets.map((t: { key: string }) => t.key)).toEqual(["MKT-1", "MKT-2", "MKT-3", "MKT-4", "MKT-5"]);

  const csv = await page.request.get(`/api/w/${await page.evaluate(() => document.querySelector<HTMLAnchorElement>("a[href*='format=csv']")!.href.split("/api/w/")[1]!.split("/")[0])}/export?format=csv`);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const text = await csv.text();
  expect(text.startsWith("﻿Key;Projekt;Titel;Status;Priorität")).toBe(true);
  expect(text).toContain("MKT-1;Marketing;");

  // Not for other workspaces.
  const exportUrl = csv.url();
  const stranger = await browser.newPage();
  await createWorkspace(stranger, `tom@${uniqueDomain("data2")}`, "Fremd GmbH");
  expect((await stranger.request.get(exportUrl)).status()).toBe(404);

  // Delete: wrong slug is refused, the right one removes everything.
  const confirm = page.getByLabel(`Zur Bestätigung „${slug}“ eintippen`);
  await waitForHydration(confirm);
  await confirm.fill("falsch");
  await page.getByRole("button", { name: "Workspace endgültig löschen" }).click();
  await expect(page.getByText("Das Kürzel stimmt nicht – nichts gelöscht.")).toBeVisible();
  await confirm.fill(slug);
  await page.getByRole("button", { name: "Workspace endgültig löschen" }).click();
  await expect(page).toHaveURL(/\/(start|onboarding(\?step=\d)?)$/);
  expect((await page.goto(path))?.status()).toBe(404);
  expect((await page.request.get(exportUrl)).status()).toBe(404);
});

test("export needs a signed-in admin (anonymous → 401)", async ({ browser }) => {
  const owner = await browser.newPage();
  const domain = uniqueDomain("datamember");
  const path = await createWorkspace(owner, `eva@${domain}`, "Mitglied GmbH");
  await owner.goto(`${path}/settings/data`);
  const href = await owner.getByRole("link", { name: "JSON herunterladen" }).getAttribute("href");
  // A member of another workspace, and anonymous: no access.
  expect((await (await browser.newContext()).request.get(href!)).status()).toBe(401);
});
