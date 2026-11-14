import { expect, test, type Page } from "@playwright/test";
import { createWorkspace, uniqueDomain } from "./helpers/auth";
import { waitForHydration } from "./helpers/hydration";

const detail = (page: Page) => page.getByRole("dialog");

// The onboarding workspace starts with MKT-1 … MKT-5, so new tickets count from MKT-6.
test("hierarchy: epic → story → subtask, checklist item becomes a subtask", async ({ page }) => {
  const path = await createWorkspace(page, `lea.becker@${uniqueDomain("hierarchy")}`, "Hierarchie GmbH");
  await page.goto(`${path}/p/MKT`);
  const quickAdd = page.getByRole("textbox", { name: "Neues Ticket – Titel eingeben und Enter drücken" });
  await waitForHydration(quickAdd);

  // 1. Epic via the quick add with the type chosen next to it.
  await page.getByLabel("Typ für neue Tickets").selectOption("epic");
  await quickAdd.fill("Launch vorbereiten");
  await quickAdd.press("Enter");
  const epicRow = page.locator("[data-ticket-row]", { hasText: "Launch vorbereiten" });
  await expect(epicRow.getByText("MKT-6", { exact: true })).toBeVisible();
  await expect(epicRow.getByText("Typ: Epic")).toBeAttached();
  await epicRow.getByRole("button", { name: "MKT-6 öffnen: Launch vorbereiten" }).click();
  await expect(detail(page).getByLabel("Typ", { exact: true })).toHaveValue("epic");

  // 2. Story inside the epic.
  const epicChildren = detail(page).getByRole("region", { name: "Tickets in diesem Epic" });
  await expect(epicChildren.getByText("Noch keine.")).toBeVisible();
  await epicChildren.getByLabel("Typ des neuen Tickets").selectOption("story");
  await epicChildren.getByRole("textbox", { name: "Story/Aufgabe anlegen" }).fill("Landingpage");
  await epicChildren.getByRole("textbox", { name: "Story/Aufgabe anlegen" }).press("Enter");
  await expect(epicChildren.getByRole("button", { name: "MKT-7 öffnen: Landingpage" })).toBeVisible();
  await expect(epicChildren.getByText("0 von 1 erledigt")).toBeVisible();
  await expect(epicChildren.getByText("nicht zugewiesen")).toBeVisible();

  // 3. Open the story: parent link back to the epic, then a subtask under it.
  await epicChildren.getByRole("button", { name: "MKT-7 öffnen: Landingpage" }).click();
  await expect(detail(page).getByLabel("Typ", { exact: true })).toHaveValue("story");
  await expect(detail(page).getByRole("button", { name: "Übergeordnetes Ticket MKT-6 öffnen: Launch vorbereiten" })).toBeVisible();
  const subtasks = detail(page).getByRole("region", { name: "Unteraufgaben" });
  await subtasks.getByRole("textbox", { name: "Unteraufgabe anlegen" }).fill("Texte schreiben");
  await subtasks.getByRole("textbox", { name: "Unteraufgabe anlegen" }).press("Enter");
  await expect(subtasks.getByRole("button", { name: "MKT-8 öffnen: Texte schreiben" })).toBeVisible();

  // 4. Checklist item → subtask ticket.
  const checklistInput = detail(page).getByRole("textbox", { name: "Punkt zur Checkliste hinzufügen" });
  await checklistInput.fill("Bilder auswählen");
  await checklistInput.press("Enter");
  await expect(detail(page).getByRole("checkbox", { name: "Bilder auswählen erledigt" })).toBeVisible();
  await detail(page).getByRole("button", { name: "„Bilder auswählen“ in Unteraufgabe umwandeln" }).click();
  await expect(subtasks.getByRole("button", { name: "MKT-9 öffnen: Bilder auswählen" })).toBeVisible();
  await expect(detail(page).getByRole("checkbox", { name: "Bilder auswählen erledigt" })).toHaveCount(0);
  await expect(subtasks.getByText("0 von 2 erledigt")).toBeVisible();

  // Rules are checked on the server: a story under an epic cannot become an epic.
  await detail(page).getByLabel("Typ", { exact: true }).selectOption("epic");
  await expect(page.getByRole("alert").filter({ hasText: "Ein Epic kann keinem anderen Ticket untergeordnet werden." })).toBeVisible();
  await expect(detail(page).getByLabel("Typ", { exact: true })).toHaveValue("story");

  await detail(page).getByRole("tab", { name: "Aktivität" }).click();
  await expect(detail(page).getByText("hat „Bilder auswählen“ in die Unteraufgabe MKT-9 umgewandelt")).toBeVisible();

  // 5. The subtask knows its parent; the type filter narrows the list.
  await subtasks.getByRole("button", { name: "MKT-9 öffnen: Bilder auswählen" }).click();
  await expect(detail(page).getByLabel("Typ", { exact: true })).toHaveValue("subtask");
  await expect(detail(page).getByRole("button", { name: "Übergeordnetes Ticket MKT-7 öffnen: Landingpage" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto(`${path}/p/MKT?type=subtask`);
  await expect(page.locator("[data-ticket-row]")).toHaveCount(2);
});
