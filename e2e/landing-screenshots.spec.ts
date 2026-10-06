import { execSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { createWorkspace } from "./helpers/auth";
import { waitForHydration } from "./helpers/hydration";
import { ticketSaved } from "./helpers/saved";

// Generates the screenshots for the landing page (public/landing/*.jpg) from a demo workspace.
// Not part of the normal suite: SCREENSHOTS=1 pnpm exec playwright test e2e/landing-screenshots.spec.ts

test.skip(!process.env.SCREENSHOTS, "only on demand");
// Native date inputs follow the browser UI language, not the page locale.
test.use({ launchOptions: { args: ["--lang=de-DE"] } });
test.setTimeout(240_000);

const psql = (q: string) => execSync(`docker exec -i inhouseticket-db-1 psql -U inhouseticket -d inhouseticket -Atq`, { input: q }).toString().trim();

async function quickAdd(page: Page, lines: string[]) {
  const box = page.getByRole("textbox", { name: /Neues Ticket/ });
  await waitForHydration(box);
  for (const line of lines) {
    await box.fill(line);
    await Promise.all([ticketSaved(page), box.press("Enter")]);
  }
}

async function setStatus(page: Page, key: string, status: string) {
  await page.getByRole("button", { name: new RegExp(`^Status von ${key}`) }).click();
  await Promise.all([ticketSaved(page), page.getByRole("menuitem", { name: status }).click()]);
}

async function newProject(page: Page, name: string, key: string) {
  await page.getByRole("complementary", { name: "Seitenleiste" }).getByRole("button", { name: "Neues Projekt" }).click();
  const dialog = page.getByRole("dialog", { name: "Neues Projekt" });
  await dialog.getByRole("textbox", { name: "Name" }).fill(name);
  await dialog.getByRole("textbox", { name: "Kürzel" }).fill(key);
  await dialog.getByRole("button", { name: "Anlegen" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

test("landing screenshots", async ({ browser }) => {
  const domain = `nordlicht-${Date.now().toString(36)}.de`;
  const setup = await (await browser.newContext({ viewport: { width: 1360, height: 860 }, locale: "de-DE" })).newPage();
  const path = await createWorkspace(setup, `lea@${domain}`, "Nordlicht Studio");

  // Colleagues straight into the local database (demo only).
  const wsId = psql(`select id from workspace where domain = '${domain}'`);
  for (const [id, name] of [["anna", "Anna Weber"], ["ben", "Ben Krüger"], ["mia", "Mia Schulz"]] as const) {
    psql(`insert into "user" (id, name, email, email_verified, created_at, updated_at) values ('demo-${id}-${domain}', '${name}', '${id}@${domain}', true, now(), now());
      insert into membership (workspace_id, user_id, role) values ('${wsId}', 'demo-${id}-${domain}', 'member');`);
  }
  psql(`update "user" set name = 'Lea Hoffmann' where email = 'lea@${domain}'`);

  await newProject(setup, "Website-Relaunch", "WEB");
  await quickAdd(setup, [
    "Startseite: Hero-Bereich neu gestalten @anna !hoch ^freitag",
    "Bildsprache mit der Agentur abstimmen @lea !mittel",
    "Ladezeit der Produktseiten unter 1 s bringen @ben !dringend ^morgen",
    "Kontaktformular an CRM anbinden @ben !mittel",
    "Texte für Über-uns-Seite @mia !niedrig",
    "Cookie-Banner entfernen (nicht mehr nötig) @ben !hoch",
    "Redirects alter URLs prüfen @mia !mittel ^nächste-woche",
  ]);
  await setStatus(setup, "WEB-1", "In Arbeit");
  await setStatus(setup, "WEB-3", "In Arbeit");
  await setStatus(setup, "WEB-6", "Review");
  await setStatus(setup, "WEB-5", "Erledigt");

  await newProject(setup, "Messe Herbst", "MES");
  await quickAdd(setup, ["Standfläche buchen @lea !dringend ^morgen", "Flyer drucken lassen @mia !hoch", "Team-Shirts bestellen @anna !niedrig"]);

  // History for the throughput chart: finished tickets spread over the last weeks.
  await setup.goto(`${path}/p/MKT`);
  await quickAdd(setup, Array.from({ length: 14 }, (_, i) => `Kampagne ${i + 1} auswerten @${["anna", "ben", "mia", "lea"][i % 4]}`));
  psql(`update ticket t set status_id = s.id, completed_at = now() - ((t.number * 3) || ' days')::interval
    from status s, project p where p.id = t.project_id and p.key = 'MKT' and p.workspace_id = '${wsId}'
    and s.project_id = p.id and s.category = 'done' and t.title like 'Kampagne %';`);

  for (const scheme of ["light", "dark"] as const) {
    const page = await (await browser.newContext({ viewport: { width: 1360, height: 860 }, colorScheme: scheme, locale: "de-DE", timezoneId: "Europe/Berlin", storageState: await setup.context().storageState() })).newPage();
    const shot = async (url: string, name: string) => {
      await page.goto(url);
      await waitForHydration(page.getByRole("button", { name: /^Konto von/ }));
      await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }); // dev badge
      await page.waitForTimeout(600);
      await page.screenshot({ path: `public/landing/${name}-${scheme}.jpg`, type: "jpeg", quality: 82 });
    };
    await shot(`${path}/p/WEB`, "list");
    await shot(`${path}/p/WEB?view=board`, "board");
    await shot(`${path}/dashboard`, "dashboard");
  }
});
