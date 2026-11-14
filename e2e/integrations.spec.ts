import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { createFakeClickUp, sampleData } from "../src/lib/integrations/clickup/fake";
import { createWorkspace, uniqueDomain } from "./helpers/auth";
import { waitForHydration } from "./helpers/hydration";

// ClickUp setup wizard against a local stand-in for the ClickUp API (the dev server points
// CLICKUP_API_URL here, see playwright.config.ts). Invented data, no real ClickUp involved.

const PORT = 3199;
const domain = uniqueDomain("clickup-api");
const admin = `ina@${domain}`;
const data = sampleData();
data.members[0]!.email = admin;
const fake = createFakeClickUp(data);
let server: Server;

test.beforeAll(async () => {
  server = createServer((req, res) => {
    const out = fake.handle(req.method ?? "GET", `http://127.0.0.1:${PORT}${req.url}`, { authorization: req.headers.authorization });
    res.writeHead(out.status, out.headers);
    res.end(JSON.stringify(out.body));
  });
  await new Promise<void>((resolve) => server.listen(PORT, "127.0.0.1", resolve));
});

test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test("connect ClickUp: token, selection, mapping, first sync, source link, disconnect", async ({ page, browser }) => {
  const path = await createWorkspace(page, admin, "Klickwerk GmbH");
  await page.goto(`${path}/settings/integrations`);
  await expect(page.getByRole("heading", { name: "Integrationen", level: 1 })).toBeVisible();
  for (const soon of ["Jira", "Slack", "Miro"]) await expect(page.getByRole("listitem").filter({ hasText: soon })).toContainText("bald");
  await page.getByRole("link", { name: "ClickUp: Verbinden" }).click();

  // Step 1: token – a wrong one is refused, the right one shows the ClickUp workspace.
  // exact: the section "Persönlichen API-Token eingeben" also carries the word as its label.
  const token = page.getByLabel("API-Token", { exact: true });
  await waitForHydration(token);
  await token.fill("pk_wrong_token_0000");
  await page.getByRole("button", { name: "Token prüfen" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "ClickUp hat den Token abgelehnt" })).toBeVisible();
  await token.fill(data.token);
  await page.getByRole("button", { name: "Token prüfen" }).click();

  // Step 2: spaces and lists.
  await expect(page.getByRole("heading", { name: "Spaces und Listen auswählen" })).toBeVisible();
  await waitForHydration(page.getByRole("button", { name: "Weiter zur Zuordnung" }));
  await page.getByRole("button", { name: "Weiter zur Zuordnung" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "mindestens einen Space oder eine Liste" })).toBeVisible();
  await page.getByLabel("Ganzer Space „Marketing“").check();
  await page.getByLabel("Angebote", { exact: true }).check();
  await page.getByRole("button", { name: "Weiter zur Zuordnung" }).click();

  // Step 3: mapping – suggestions and e-mail match are preselected.
  await expect(page.getByRole("heading", { name: "Zuordnung bestätigen" })).toBeVisible();
  await expect(page.getByLabel("Status für „complete“")).toHaveValue("Erledigt");
  await expect(page.getByLabel("Status für „in progress“")).toHaveValue("In Arbeit");
  await expect(page.getByLabel("Status für „wartet auf freigabe“")).toHaveValue("own");
  await expect(page.getByLabel("Mitglied für Person A")).not.toHaveValue("");
  await expect(page.getByLabel("Mitglied für Person B")).toHaveValue("");
  await page.getByRole("button", { name: "Speichern und Abgleich starten" }).click();

  // Step 4: the first sync runs in the background; the page follows it.
  await expect(page.getByRole("heading", { name: "Verbindung", exact: true })).toBeVisible();
  await expect(page.getByText("Beispiel GmbH")).toBeVisible();
  await expect(page.getByText(/pk_…1234/)).toBeVisible();
  await expect(page.getByRole("table")).toContainText("5 gelesen · 5 angelegt", { timeout: 30_000 });
  await expect(page.getByRole("table")).toContainText("Erstabgleich");

  // Tickets arrived in a project per space, with the source in the detail.
  await page.goto(`${path}/p/MAR?t=MAR-1`);
  await expect(page.getByText("Quelle: ClickUp")).toBeVisible();
  await expect(page.getByRole("link", { name: "In ClickUp öffnen" })).toHaveAttribute("href", "https://app.clickup.com/t/t-1");

  // Other workspaces and their admins never see this page.
  const stranger = await browser.newPage();
  await createWorkspace(stranger, `tom@${uniqueDomain("clickup-x")}`, "Fremd GmbH");
  const res = await stranger.goto(`${path}/settings/integrations/clickup`);
  expect(res?.status()).toBe(404);
  await stranger.close();

  // Disconnect: confirmation required, tickets stay.
  await page.goto(`${path}/settings/integrations/clickup`);
  await page.getByLabel("Ja, Verbindung trennen – die Tickets bleiben").check();
  await page.getByRole("button", { name: "ClickUp trennen" }).click();
  await expect(page.getByRole("status").filter({ hasText: "ClickUp wurde getrennt" })).toBeVisible();
  await page.goto(`${path}/p/MAR?t=MAR-1`);
  await expect(page.getByRole("textbox", { name: "Titel" })).toHaveValue("Kampagne planen");
  await expect(page.getByText("Quelle: ClickUp")).toHaveCount(0);
});
