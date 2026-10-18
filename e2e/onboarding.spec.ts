import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  completeJoinerWizard,
  completeOwnerWizard,
  createWorkspace,
  INVITE_LINK,
  linkFromMail,
  ONBOARDING_URL,
  signIn,
  uniqueDomain,
} from "./helpers/auth";
import { waitForHydration } from "./helpers/hydration";

// Onboarding wizard (docs/ONBOARDING.md): owner happy path by keyboard, resuming after reload,
// "Später fertigstellen" with the banner, and the short wizard for people who join.

const heading = (page: Page, name: string) => page.getByRole("heading", { name, level: 1 });
const next = (page: Page) => page.getByRole("button", { name: "Weiter" });

async function axe(page: Page, label: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).exclude("nextjs-portal").analyze();
  return violations.map((v) => `${label}: ${v.id} ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
}

test("owner: magic link → wizard by keyboard → board with tutorial tickets", async ({ browser }) => {
  test.setTimeout(120_000);
  const page = await (await browser.newContext({ reducedMotion: "reduce" })).newPage();
  const domain = uniqueDomain("wizard");
  const since = new Date(Date.now() - 1000);
  await signIn(page, `max.mustermann@${domain}`);
  await expect(page).toHaveURL(ONBOARDING_URL);

  // 1 · Profile: name from the address, time zone from the browser.
  await expect(heading(page, "Willkommen! Wie heißt du?")).toBeVisible();
  await expect(page.getByText("Schritt 1 von 6")).toBeVisible();
  const name = page.getByRole("textbox", { name: "Dein Name" });
  await expect(name).toHaveValue("Max Mustermann");
  await waitForHydration(name);
  await expect(name).toBeFocused();
  await name.fill("Max M.");
  await expect(page.getByRole("button", { name: "Zurück" })).toHaveCount(0);
  await name.press("Enter");

  // 2 · Workspace: name from the domain, auto-join pre-selected (docs/ONBOARDING.md §6).
  await expect(heading(page, "Dein Workspace")).toBeVisible();
  await expect(page).toHaveURL(/\/onboarding\?step=2$/);
  const wsName = page.getByRole("textbox", { name: "Name des Workspace" });
  await expect(wsName).toHaveValue(/^Wizard /);
  await expect(page.getByRole("checkbox", { name: /dürfen beitreten/ })).toBeChecked();
  // Reload before the workspace exists: still step 2, nothing created yet.
  await page.reload();
  await expect(heading(page, "Dein Workspace")).toBeVisible();
  await wsName.fill("Wizard GmbH");
  await expect(page.getByRole("button", { name: "Später fertigstellen" })).toHaveCount(0);
  await wsName.press("Enter");

  // 3 · Team area: radiogroup, arrow keys select.
  await expect(heading(page, "Wofür nutzt ihr inhouseticket?")).toBeVisible();
  const group = page.getByRole("radiogroup");
  await expect(group.getByRole("radio")).toHaveCount(8);
  await expect(next(page)).toBeDisabled();
  await group.getByRole("radio", { name: "Marketing" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(group.getByRole("radio", { name: "IT" })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(group.getByRole("radio", { name: "Marketing" })).toHaveAttribute("aria-checked", "true");
  await expect(group.getByRole("radio", { name: "Marketing" })).toBeFocused();
  await page.keyboard.press("Enter");

  // 4 · Start view: Board is pre-selected. Reload here comes back to step 4 (stored in the database).
  await expect(heading(page, "Wie möchtest du deine Tickets sehen?")).toBeVisible();
  await page.reload();
  await expect(heading(page, "Wie möchtest du deine Tickets sehen?")).toBeVisible();
  await page.goto("/onboarding");
  await expect(heading(page, "Wie möchtest du deine Tickets sehen?")).toBeVisible();
  // ?step= may go back, never ahead.
  await page.goto("/onboarding?step=6");
  await expect(heading(page, "Wie möchtest du deine Tickets sehen?")).toBeVisible();
  await expect(page.getByRole("radio", { name: /^Board/ })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Zurück" }).click();
  await expect(heading(page, "Wofür nutzt ihr inhouseticket?")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Marketing" })).toHaveAttribute("aria-checked", "true");
  await next(page).click();
  await expect(heading(page, "Wie möchtest du deine Tickets sehen?")).toBeVisible();
  await next(page).click();

  // 5 · Two questions: toggle buttons (aria-pressed) and a radiogroup; import hint for Jira.
  await expect(heading(page, "Zwei kurze Fragen")).toBeVisible();
  await expect(page.getByText("Schritt 5 von 6 · optional")).toBeVisible();
  const jira = page.getByRole("button", { name: "Jira" });
  await jira.focus();
  await page.keyboard.press("Space");
  await expect(jira).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/Tipp: Projekte aus Jira/)).toBeVisible();
  await page.getByRole("radio", { name: "Empfehlung" }).click();
  await next(page).click();

  // 6 · Invite: chips with status; freemail is refused, external marked, the counter counts.
  await expect(heading(page, "Lade dein Team ein")).toBeVisible();
  const input = page.getByRole("textbox", { name: "E-Mail-Adressen" });
  await input.fill(`anna@${domain}, max@gmail.com, frei@agentur-${domain} anna@${domain} `);
  const chips = page.getByRole("list", { name: "Adressen" });
  await expect(chips.getByRole("listitem")).toHaveCount(4);
  await expect(chips.getByText("Freemail nicht erlaubt")).toBeVisible();
  await expect(chips.getByText("extern")).toBeVisible();
  await expect(chips.getByText("doppelt")).toBeVisible();
  await expect(page.getByText("3/100")).toBeVisible();
  await page.getByRole("button", { name: "max@gmail.com entfernen" }).click();
  await expect(chips.getByRole("listitem")).toHaveCount(3);
  expect(await axe(page, "invite step")).toEqual([]);
  await page.getByRole("button", { name: "Los geht's" }).click();

  // Done: the template project opens in the chosen view, tutorial tickets with the label.
  await expect(page).toHaveURL(/\/p\/MKT\?view=board$/);
  const board = page.getByRole("region", { name: /Board/ }).or(page.locator("main"));
  await expect(board.getByText("Drück C – und leg dein erstes eigenes Ticket an")).toBeVisible();
  await expect(board.getByText("Zieh mich nach „In Arbeit“ →")).toBeVisible();
  await expect(board.getByText("Newsletter November planen")).toBeVisible();
  // Invited in step 6 → no "Lade dein Team ein" ticket; four tickets, all "Tutorial".
  await expect(board.getByText("Lade dein Team ein")).toHaveCount(0);
  await expect(page.locator("[data-card]")).toHaveCount(4);
  // The project link in the sidebar opens the start view, too.
  await expect(page.getByRole("link", { name: /Marketing/ }).first()).toHaveAttribute("href", /\/p\/MKT\?view=board$/);
  await expect(page.getByRole("heading", { name: "Einrichtung fertigstellen" })).toHaveCount(0);

  // Only the internal colleague and the external address got a mail; the person's name is set.
  await linkFromMail(`anna@${domain}`, INVITE_LINK, since);
  await linkFromMail(`frei@agentur-${domain}`, INVITE_LINK, since);
  await expect(page.getByRole("button", { name: /^Konto von Max M\./ })).toBeVisible();

  // Back to /onboarding: nothing left to do.
  await page.goto("/onboarding");
  await expect(page).not.toHaveURL(/\/onboarding/);
});

test("finish later: banner brings the owner back to the same step, list view without invites", async ({ page }) => {
  await signIn(page, `ole@${uniqueDomain("later")}`);
  await expect(heading(page, "Willkommen! Wie heißt du?")).toBeVisible();
  await next(page).click();
  await page.getByRole("textbox", { name: "Name des Workspace" }).fill("Später KG");
  await next(page).click();
  await expect(heading(page, "Wofür nutzt ihr inhouseticket?")).toBeVisible();
  await page.getByRole("button", { name: "Später fertigstellen" }).click();

  await expect(page.getByRole("heading", { name: "Willkommen bei Später KG" })).toBeVisible();
  const banner = page.getByRole("region", { name: "Einrichtung fertigstellen" });
  await expect(banner).toBeVisible();
  await banner.getByRole("link", { name: "Weiter einrichten" }).click();
  await expect(heading(page, "Wofür nutzt ihr inhouseticket?")).toBeVisible();
  await page.getByRole("radio", { name: "Entwicklung" }).click();
  await next(page).click();
  await page.getByRole("radio", { name: /^Liste/ }).click();
  await next(page).click();
  await page.getByRole("button", { name: "Überspringen" }).click();
  await page.getByRole("button", { name: "Überspringen" }).click();

  await expect(page).toHaveURL(/\/p\/DEV$/);
  await expect(page.getByRole("button", { name: /^DEV-1 öffnen: Drück C/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^DEV-2 öffnen: Ändere meinen Status per Klick/ })).toBeVisible();
  // Invite step skipped → the "invite your team" tutorial ticket is there.
  await expect(page.getByRole("button", { name: /^DEV-4 öffnen: Lade dein Team ein/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^DEV-5 öffnen: Login-Seite lädt langsam/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Einrichtung fertigstellen" })).toHaveCount(0);
});

test("joiners: invitation and auto-join get the short wizard and land in Meine Aufgaben", async ({ browser }) => {
  test.setTimeout(120_000);
  const domain = uniqueDomain("joiner");
  const owner = await browser.newPage();
  const since = new Date(Date.now() - 1000);
  await signIn(owner, `chefin@${domain}`);
  // Auto-join stays on (the wizard's suggestion).
  await completeOwnerWizard(owner, "Beitritt AG", { invites: `kim@${domain}`, autoJoin: true });

  // Invited colleague: profile + start view only.
  const kim = await (await browser.newContext({ colorScheme: "dark", reducedMotion: "reduce" })).newPage();
  const invite = await linkFromMail(`kim@${domain}`, INVITE_LINK, since);
  await signIn(kim, `kim@${domain}`, new URL(invite).pathname);
  await kim.getByRole("button", { name: "Annehmen" }).click();
  await expect(kim).toHaveURL(ONBOARDING_URL);
  await expect(heading(kim, "Willkommen! Wie heißt du?")).toBeVisible();
  await expect(kim.getByText("Schritt 1 von 2")).toBeVisible();
  await expect(kim.getByText(/Du bist jetzt bei Beitritt AG/)).toBeVisible();
  expect(await axe(kim, "joiner profile (dark)")).toEqual([]);
  // The workspace is closed until the wizard is done.
  await kim.goto(new URL(owner.url()).pathname.split("/p/")[0]!);
  await expect(kim).toHaveURL(ONBOARDING_URL);
  await completeJoinerWizard(kim, "Board");
  await expect(kim.getByRole("heading", { name: "Meine Aufgaben" })).toBeVisible();
  await expect(kim.getByRole("link", { name: /Marketing/ }).first()).toHaveAttribute("href", /\/p\/MKT\?view=board$/);

  // Same domain, no invitation: auto-join is on → "Beitreten" on /start, then the short wizard.
  const lea = await browser.newPage();
  await signIn(lea, `lea@${domain}`);
  await expect(lea).toHaveURL(/\/start$/);
  await lea.getByRole("button", { name: "Beitreten" }).click();
  await completeJoinerWizard(lea);
  await expect(lea.getByRole("heading", { name: "Meine Aufgaben" })).toBeVisible();
});

test("existing members are never sent into the wizard again", async ({ page }) => {
  const path = await createWorkspace(page, `bestand@${uniqueDomain("bestand")}`, "Bestand AG");
  await page.goto("/start");
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/start$|\/[a-z0-9-]+$/);
  await expect(page).not.toHaveURL(/onboarding/);
});
