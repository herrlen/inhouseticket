import { expect, test } from "@playwright/test";
import { createWorkspace, ONBOARDING_URL, signIn, uniqueDomain } from "./helpers/auth";
import { waitForHydration } from "./helpers/hydration";

const csv = (assignee: string) =>
  [
    "Summary,Issue key,Issue id,Issue Type,Status,Status Category,Project key,Project name,Priority,Assignee,Created,Labels,Parent id,Comment",
    `Login überarbeiten,WEB-1,10001,Story,In Progress,In Progress,WEB,Website,High,${assignee},01/Sep/26 9:15 AM,ux,,"02/Sep/26 10:00 AM;abc;Bitte bis Freitag"`,
    "Formular prüfen,WEB-2,10002,Sub-task,Done,Done,WEB,Website,,,02/Sep/26 9:00 AM,,10001,",
    "Bug im Footer,WEB-3,10003,Bug,To Do,To Do,WEB,Website,Highest,Tom Fremd,03/Sep/26 11:00 AM,,,",
  ].join("\n");

test("import a Jira CSV: preview, then a new project with the tickets", async ({ page, browser }) => {
  const domain = uniqueDomain("import");
  const path = await createWorkspace(page, `ina@${domain}`, "Umzug GmbH");
  await page.goto(`${path}/settings/data`);
  await page.getByRole("link", { name: "Import öffnen" }).click();
  await expect(page.getByRole("heading", { name: "Projekte importieren" })).toBeVisible();

  const file = page.getByLabel("Export-Datei (CSV)");
  await waitForHydration(file);
  // Wrong tool → clear message, nothing imported.
  await file.setInputFiles({ name: "clickup.csv", mimeType: "text/csv", buffer: Buffer.from("Task Name,Status\nx,open\n") });
  await page.getByRole("button", { name: "Vorschau anzeigen" }).click();
  await expect(page.getByText("Das sieht nicht nach einem Jira-Export aus", { exact: false })).toBeVisible();

  await file.setInputFiles({ name: "jira.csv", mimeType: "text/csv", buffer: Buffer.from(csv(`ina@${domain}`)) });
  await page.getByRole("button", { name: "Vorschau anzeigen" }).click();
  const preview = page.getByRole("region", { name: "Vorschau" });
  await expect(preview).toContainText("2 Tickets, 1 Unteraufgaben, 1 Kommentare, 1 Labels");
  await expect(preview).toContainText("kein Mitglied – bleibt unzugewiesen");
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Website");
  // MKT is the onboarding project's key; WEB from the file is free.
  await expect(page.getByLabel("Kürzel")).toHaveValue("WEB");

  await page.getByRole("button", { name: "2 Tickets importieren" }).click();
  await expect(page.getByText("2 Tickets in WEB importiert.")).toBeVisible();
  await page.getByRole("link", { name: "Zum Projekt" }).click();
  await expect(page).toHaveURL(new RegExp(`${path}/p/WEB`));
  await expect(page.getByText("Login überarbeiten")).toBeVisible();
  await expect(page.getByText("Bug im Footer")).toBeVisible();

  // Same key again is refused.
  await page.goto(`${path}/settings/data/import`);
  await waitForHydration(page.getByLabel("Export-Datei (CSV)"));
  await page.getByLabel("Export-Datei (CSV)").setInputFiles({ name: "jira.csv", mimeType: "text/csv", buffer: Buffer.from(csv("")) });
  await page.getByRole("button", { name: "Vorschau anzeigen" }).click();
  await expect(page.getByLabel("Kürzel")).toHaveValue("WEB2");

  // Other workspaces cannot import here.
  const stranger = await browser.newPage();
  await createWorkspace(stranger, `tom@${uniqueDomain("import2")}`, "Fremd GmbH");
  const url = await page.evaluate(() => (performance.getEntriesByType("resource") as PerformanceResourceTiming[]).map((e) => e.name).find((n) => n.includes("/import"))!);
  const res = await stranger.request.post(url, {
    headers: { origin: new URL(url).origin },
    multipart: { source: "jira", mode: "preview", file: { name: "x.csv", mimeType: "text/csv", buffer: Buffer.from(csv("")) } },
  });
  expect(res.status()).toBe(404);
});

test("import a ClickUp workspace export: one project per space, in the background, idempotent", async ({ page }) => {
  const path = await createWorkspace(page, `ina@${uniqueDomain("clickup")}`, "Klick GmbH");
  await page.goto(`${path}/settings/data/import`);
  const select = page.getByLabel("Altes Tool");
  await waitForHydration(select);
  await select.selectOption("clickup");
  await expect(page.getByText("Einstellungen → Import/Export → Exportieren")).toBeVisible();
  const file = [
    "Task ID,Task Link,Task Name,Task Content,Status,Date Created,Parent ID,Assignees,Tags,Priority,List Name,Folder Name/Path,Space Name",
    'a1,https://app.clickup.com/t/a1,Newsletter planen,,in progress,1756717200000,null,[],[mail],2,Kampagnen,"[""Marketing""]",Team',
    "a2,https://app.clickup.com/t/a2,Texte schreiben,,complete,1756717300000,a1,[],[],null,Kampagnen,,Team",
    "a3,https://app.clickup.com/t/a3,Korrektur lesen,,achived,1756717400000,a2,[],[],null,Kampagnen,,Team",
    "a3,https://app.clickup.com/t/a3,Korrektur lesen,,achived,1756717400000,a2,[],[],null,Kampagnen,,Team",
    "b1,https://app.clickup.com/t/b1,Release planen,,warten auf kunde,1756717500000,null,[Tom Fremd],[],1,Backlog,,Produkt",
  ].join("\n");
  const upload = async () => {
    await page.getByLabel("Export-Datei (CSV)").setInputFiles({ name: "clickup.csv", mimeType: "text/csv", buffer: Buffer.from(file) });
    await page.getByRole("button", { name: "Vorschau anzeigen" }).click();
    return page.getByRole("region", { name: "Vorschau" });
  };

  const preview = await upload();
  await expect(preview).toContainText("2 Projekte – eins pro Space");
  await expect(preview).toContainText("1 doppelte Zeilen (gleiche Task ID) werden verworfen.");
  await expect(preview).toContainText("1 Person hat kein passendes Mitglied");
  await expect(page.getByLabel("Ziel für den Status „achived“")).toHaveValue("Erledigt");
  await expect(page.getByLabel("Ziel für den Status „warten auf kunde“")).toHaveValue("own");
  await page.getByLabel("Ziel für den Status „warten auf kunde“").selectOption("Review");
  // People table: no member is called "Tom Fremd" → "Nicht zuweisen"; give the task to Ina instead.
  const tom = page.getByLabel("Mitglied für „Tom Fremd“");
  await expect(tom).toHaveValue("");
  await tom.selectOption({ index: 1 });
  await expect(preview).not.toContainText("kein passendes Mitglied");

  await page.getByRole("button", { name: "4 Aufgaben importieren" }).click();
  await expect(page.getByRole("heading", { name: "Import abgeschlossen" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("4 Tickets angelegt")).toBeVisible();

  // Same file again: everything is known, nothing to import.
  await page.getByRole("button", { name: "Weitere Datei importieren" }).click();
  const again = await upload();
  await expect(again).toContainText("4 Aufgaben gibt es schon");
  // The people choice was saved and is suggested again.
  await expect(page.getByLabel("Mitglied für „Tom Fremd“")).not.toHaveValue("");
  await expect(page.getByRole("button", { name: "0 Aufgaben importieren" })).toBeDisabled();
});

test("import Notion and monday.com CSVs; the preview lists the detected columns", async ({ page }) => {
  const path = await createWorkspace(page, `ina@${uniqueDomain("notion")}`, "Notiz GmbH");
  await page.goto(`${path}/settings/data/import`);
  const select = page.getByLabel("Altes Tool");
  await waitForHydration(select);

  await select.selectOption("notion");
  const notion = ["Aufgabe,Status,Zuständig,Fällig", 'Website relaunchen,In Bearbeitung,Ina,"October 15, 2026"', "Flyer drucken,Erledigt,,"].join("\n");
  await page.getByLabel("Export-Datei (CSV)").setInputFiles({ name: "Aufgaben 0123456789abcdef0123456789abcdef_all.csv", mimeType: "text/csv", buffer: Buffer.from(notion) });
  await page.getByRole("button", { name: "Vorschau anzeigen" }).click();
  const preview = page.getByRole("region", { name: "Vorschau" });
  await expect(preview).toContainText("Erkannte Spalten");
  await expect(preview).toContainText("Titel ← Aufgabe");
  await expect(preview).toContainText("Fällig ← Fällig");
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Aufgaben");
  await page.getByRole("button", { name: "2 Tickets importieren" }).click();
  await expect(page.getByText("2 Tickets in AUF importiert.")).toBeVisible();

  await page.getByRole("button", { name: "Weitere Datei importieren" }).click();
  await select.selectOption("monday");
  const monday = ["Kampagnen-Board,,,", "Diese Woche,,,", "Name,Person,Status,Date", "Anzeige buchen,Ina,Working on it,2026-10-20"].join("\n");
  await page.getByLabel("Export-Datei (CSV)").setInputFiles({ name: "board.csv", mimeType: "text/csv", buffer: Buffer.from(monday) });
  await page.getByRole("button", { name: "Vorschau anzeigen" }).click();
  await expect(page.getByRole("region", { name: "Vorschau" })).toContainText("1 Tickets, 0 Unteraufgaben, 0 Kommentare, 1 Labels");
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Kampagnen-Board");
  await page.getByRole("button", { name: "1 Tickets importieren" }).click();
  await expect(page.getByText(/1 Tickets in \w+ importiert\./)).toBeVisible();
});

test("ways in: landing section, help page, onboarding and the new workspace", async ({ page }) => {
  await page.goto("/");
  const migrate = page.getByRole("region", { name: "Kostenlos umziehen" });
  await expect(migrate.getByRole("list", { name: "Unterstützte Tools" }).getByRole("listitem")).toHaveCount(4);
  // FAQ answers open without JavaScript (<details>) and point to the help page.
  const faq = page.getByRole("region", { name: "Häufige Fragen" });
  await faq.getByText("Kann ich meine Daten mitnehmen?").click();
  await expect(faq.getByRole("link", { name: "So geht der Umzug" })).toBeVisible();
  await migrate.getByRole("link", { name: "So geht der Umzug" }).click();
  await expect(page).toHaveURL(/\/umziehen$/);
  await expect(page.getByRole("heading", { level: 1, name: /umziehen/ })).toBeVisible();
  for (const tool of ["Jira", "ClickUp", "Notion", "monday.com"]) {
    await expect(page.getByRole("heading", { name: `Export aus ${tool}` })).toBeVisible();
  }

  // Onboarding: choosing an importable tool in "Zwei kurze Fragen" points to the import.
  const domain = uniqueDomain("umzug");
  await signIn(page, `ina@${domain}`);
  await expect(page).toHaveURL(ONBOARDING_URL);
  await page.getByRole("button", { name: "Weiter" }).click();
  await page.getByRole("textbox", { name: "Name des Workspace" }).fill("Umzug AG");
  await page.getByRole("button", { name: "Weiter" }).click();
  await page.getByRole("radio", { name: "Allgemein" }).click();
  await page.getByRole("button", { name: "Weiter" }).click();
  await page.getByRole("button", { name: "Weiter" }).click();
  await page.getByRole("button", { name: "ClickUp" }).click();
  await expect(page.getByText(/Tipp: Projekte aus Jira, ClickUp, Notion und monday\.com/)).toBeVisible();
  await page.getByRole("button", { name: "Weiter" }).click();
  await page.getByRole("button", { name: "Überspringen" }).click();
  await expect(page).toHaveURL(/\/p\/ALL\?view=board$/);

  // The new workspace (only the template project) offers the import.
  const path = `/${new URL(page.url()).pathname.split("/")[1]}`;
  await page.goto(path);
  const offer = page.getByRole("region", { name: "Projekte aus einem anderen Tool mitnehmen" });
  await offer.getByRole("link", { name: "Projekte importieren" }).click();
  await expect(page).toHaveURL(new RegExp(`${path}/settings/data/import$`));
});
