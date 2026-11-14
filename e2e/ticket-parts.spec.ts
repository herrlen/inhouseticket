import { expect, test, type Page } from "@playwright/test";
import { createWorkspace, uniqueDomain } from "./helpers/auth";
import { waitForHydration } from "./helpers/hydration";
import { png } from "./helpers/images";

const detail = (page: Page) => page.getByRole("dialog");

async function openTicket(page: Page, label: string, name = "Lea Becker", key = "MKT-1") {
  const email = `${name.toLowerCase().replace(" ", ".")}@${uniqueDomain(label)}`;
  const path = await createWorkspace(page, email, `${label} GmbH`);
  await page.goto(`${path}/p/MKT?t=${key}`);
  await expect(detail(page).getByRole("textbox", { name: "Titel" })).toBeVisible();
  await waitForHydration(detail(page).getByRole("textbox", { name: "Titel" }));
  return path;
}

test("subtasks: max 5, progress in list and board, activity", async ({ page }) => {
  const path = await openTicket(page, "subtasks");
  const input = detail(page).getByRole("textbox", { name: "Punkt zur Checkliste hinzufügen" });
  for (let i = 1; i <= 5; i++) {
    await input.fill(`Schritt ${i}`);
    await input.press("Enter");
    await expect(detail(page).getByRole("checkbox", { name: `Schritt ${i} erledigt` })).toBeVisible();
  }
  await expect(input).toBeDisabled();
  await expect(input).toHaveAttribute("placeholder", "Maximum von 5 Punkten erreicht");

  await detail(page).getByRole("checkbox", { name: "Schritt 1 erledigt" }).check();
  await detail(page).getByRole("checkbox", { name: "Schritt 2 erledigt" }).check();
  await expect(detail(page).getByText("2/5 · 5/5")).toBeVisible();

  await detail(page).getByRole("tab", { name: "Aktivität" }).click();
  await expect(detail(page).getByText("hat „Schritt 2“ abgehakt")).toBeVisible();

  await page.keyboard.press("Escape");
  const row = page.locator("tr", { has: page.getByText("MKT-1", { exact: true }) });
  await expect(row.getByText("2/5")).toBeVisible();
  await page.goto(`${path}/p/MKT?view=board`);
  await expect(page.locator("[data-card]").filter({ hasText: "MKT-1" }).getByText("2/5")).toBeVisible();
});

test("attachments: upload, auto-shrink, preview, reject fakes, remove", async ({ page }) => {
  await openTicket(page, "attach");
  const fileInput = detail(page).locator('input[type="file"]');

  await fileInput.setInputFiles({ name: "verlauf.png", mimeType: "image/png", buffer: png(40, 30) });
  await expect(detail(page).getByRole("button", { name: "verlauf.png groß anzeigen" })).toBeVisible();

  // 400×300 noise PNG ≈ 360 KB → the browser re-encodes it below 100 KB.
  const big = png(400, 300, true);
  expect(big.length).toBeGreaterThan(300_000);
  await fileInput.setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: big });
  const shrunk = page.getByRole("button", { name: /^foto\.(webp|jpg) groß anzeigen$/ });
  await expect(shrunk).toBeVisible({ timeout: 20_000 });
  const caption = await detail(page).locator("li", { has: shrunk }).locator("p").innerText();
  expect(Number(caption.match(/(\d+) KB/)![1])).toBeLessThanOrEqual(100);

  // A text file disguised as PNG is refused by the server's magic-byte check.
  await fileInput.setInputFiles({ name: "boese.png", mimeType: "image/png", buffer: Buffer.from("<svg><script>alert(1)</script></svg>") });
  await expect(page.getByRole("alert").filter({ hasText: "Nur Bilder im Format WebP, JPEG oder PNG." })).toBeVisible();

  await detail(page).getByRole("button", { name: "verlauf.png groß anzeigen" }).click();
  await expect(page.getByRole("dialog", { name: "verlauf.png" }).getByRole("img", { name: "verlauf.png" })).toBeVisible();
  await page.getByRole("dialog", { name: "verlauf.png" }).getByRole("button", { name: "Schließen" }).click();

  await detail(page).getByRole("button", { name: "Anhang verlauf.png entfernen" }).click();
  await expect(detail(page).getByRole("button", { name: "verlauf.png groß anzeigen" })).toHaveCount(0);
});

test("attachments are served to members only", async ({ browser }) => {
  const a = await browser.newPage();
  await openTicket(a, "attach-a");
  await detail(a).locator('input[type="file"]').setInputFiles({ name: "intern.png", mimeType: "image/png", buffer: png(20, 20) });
  const img = detail(a).getByRole("img", { name: "intern.png" });
  await expect(img).toBeVisible();
  const imgUrl = new URL((await img.getAttribute("src"))!, a.url()).toString();
  const own = await a.request.get(imgUrl);
  expect(own.status()).toBe(200);
  expect(own.headers()["content-type"]).toBe("image/png");
  expect(own.headers()["x-content-type-options"]).toBe("nosniff");

  const b = await browser.newPage();
  await openTicket(b, "attach-b");
  expect((await b.request.get(imgUrl)).status()).toBe(404);
  expect((await (await browser.newContext()).request.get(imgUrl)).status()).toBe(401);
});

test("comments with @mention and Markdown; description renders Markdown", async ({ page }) => {
  await openTicket(page, "comments", undefined, "MKT-2"); // MKT-1 (tutorial) already has a description

  await detail(page).getByRole("button", { name: "Beschreibung hinzufügen …" }).click();
  const desc = detail(page).getByRole("textbox", { name: "Beschreibung" });
  await desc.fill("**Wichtig:** Termin klären\n\n- Raum\n- Catering");
  await desc.blur();
  await expect(detail(page).locator("strong", { hasText: "Wichtig:" })).toBeVisible();
  await expect(detail(page).getByRole("listitem").filter({ hasText: "Catering" })).toBeVisible();

  const composer = detail(page).getByRole("combobox", { name: "Kommentar schreiben" });
  await composer.click();
  await composer.pressSequentially("Bitte prüfen @Le");
  await expect(detail(page).getByRole("listbox", { name: "Personen erwähnen" })).toBeVisible();
  await composer.press("Enter");
  await composer.pressSequentially("– danke *sehr*");
  await expect(composer).toHaveValue(/^Bitte prüfen @\[Lea Becker\]\([\w-]+\) – danke \*sehr\*$/);
  await detail(page).getByRole("button", { name: "Senden" }).click();

  const list = detail(page).getByRole("tabpanel");
  await expect(list.getByText("@Lea Becker")).toBeVisible();
  await expect(list.locator("em", { hasText: "sehr" })).toBeVisible();
  await expect(detail(page).getByRole("tab", { name: "Kommentare (1)" })).toBeVisible();

  await list.getByRole("button", { name: "Bearbeiten" }).click();
  const edit = list.getByRole("combobox", { name: "Kommentar schreiben" }).first();
  await edit.fill("Erledigt, danke!");
  await list.getByRole("button", { name: "Speichern" }).click();
  await expect(list.getByText("Erledigt, danke!")).toBeVisible();
  await expect(list.getByText(/bearbeitet/)).toBeVisible();

  await list.getByRole("button", { name: "Löschen" }).click();
  await expect(list.getByText("Noch keine Kommentare.")).toBeVisible();
});
