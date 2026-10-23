import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  completeJoinerWizard,
  confirmRegistration,
  createWorkspace,
  ONBOARDING_URL,
  E2E_PASSWORD,
  INVITE_LINK,
  linkFromMail,
  mailText,
  REGISTER_LINK,
  signInWithPassword,
  submitRegistration,
  uniqueDomain,
} from "./helpers/auth";

// Registration with name, address and password; the account follows the mailed link (ADR 005).

async function axe(page: Page, label: string, hover?: Locator) {
  // Not hovering anything unless asked: the click that led here may have left the pointer on a button.
  if (hover) await hover.hover();
  else await page.mouse.move(0, 0);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .exclude("nextjs-portal") // dev badge
      .analyze();
    expect(violations.map((v) => `${label} ${colorScheme}: ${v.id}`)).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });
}

test("register by keyboard, confirm with wrong then right password, land in onboarding", async ({ page, request, context }) => {
  const email = `rita@${uniqueDomain("register")}`;
  await page.goto("/login");
  await page.getByRole("link", { name: "Registrieren" }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByRole("heading", { name: "Konto erstellen" })).toBeVisible();
  const form = page.locator("main form");
  await expect(form.getByRole("link", { name: "AGB" })).toHaveAttribute("href", "/agb");
  await expect(form.getByRole("link", { name: "Datenschutzerklärung" })).toHaveAttribute("href", "/datenschutz");
  await expect(page.getByRole("button", { name: "Registrieren" })).toBeEnabled(); // hydrated
  await axe(page, "/register");
  // Hover fill of the primary button keeps its text readable (--accent-hover, not opacity).
  await axe(page, "/register hover", page.getByRole("button", { name: "Registrieren" }));

  // Browser checks first: name missing, password too short.
  await page.getByRole("button", { name: "Registrieren" }).click();
  await expect(page.getByText("Bitte gib deinen Namen ein.")).toBeVisible();

  // Keyboard only: the name field has focus, Tab walks through the form, Enter submits.
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Name" })).toBeFocused();
  await page.keyboard.type("Rita Registriert");
  await page.keyboard.press("Tab");
  await page.keyboard.type(email);
  await page.keyboard.press("Tab");
  await page.keyboard.type(E2E_PASSWORD);
  await page.keyboard.press("Tab"); // show/hide toggle
  await expect(page.getByRole("button", { name: "Passwort anzeigen" }).first()).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.type(E2E_PASSWORD);
  const since = new Date(Date.now() - 1000);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Schau in dein Postfach" })).toBeFocused();
  await expect(page.getByText(`Wir haben eine E-Mail an ${email} geschickt.`, { exact: false })).toBeVisible();

  const link = await linkFromMail(email, REGISTER_LINK, since);
  // No account before the confirmation: password sign-in fails like for any unknown address.
  const other = await context.browser()!.newContext();
  const probe = await other.newPage();
  await signInWithPassword(probe, email);
  await expect(probe.getByText("E-Mail-Adresse oder Passwort stimmt nicht.")).toBeVisible();
  await other.close();

  // What mail scanners do: fetch the link. Nothing is used up.
  expect((await request.get(link)).ok()).toBe(true);

  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Registrierung abschließen" })).toBeVisible();
  await expect(page.getByText(`Konto für ${email}`)).toBeVisible();
  await expect(page).toHaveURL(/\/register\/confirm$/); // token dropped from the address bar
  await axe(page, "/register/confirm");

  const field = page.getByLabel("Passwort", { exact: true });
  await expect(field).toBeFocused();
  await page.keyboard.type("ein-falsches-passwort");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Das Passwort stimmt nicht.", { exact: false }).first()).toBeVisible();
  await expect(field).toBeFocused();

  await field.fill(E2E_PASSWORD);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(ONBOARDING_URL);

  // The link works once; the account signs in with the registration password.
  await context.clearCookies();
  await page.goto(link);
  await expect(page.getByText("Dieser Link ist abgelaufen oder wurde schon benutzt.", { exact: false })).toBeVisible();
  await signInWithPassword(page, email);
  await expect(page).toHaveURL(ONBOARDING_URL);
});

test("an existing account gets the same screen and an 'already registered' mail", async ({ page, browser }) => {
  const domain = uniqueDomain("regexists");
  const email = `olga@${domain}`;
  await createWorkspace(page, email, "Bestand GmbH");

  const fresh = await (await browser.newContext()).newPage();
  const since = new Date(Date.now() - 1000);
  await submitRegistration(fresh, { name: "Olga Zweitkonto", email, password: "ein-ganz-anderes-pw" });
  const text = await mailText(email, since);
  expect(text).toContain("Dafür gibt es aber schon ein Konto.");
  expect(text).toContain("http://localhost:3100/login");
  expect(text).toContain("http://localhost:3100/forgot-password");
  expect(text).not.toMatch(REGISTER_LINK);

  // The old password still works; the one from the registration attempt does not.
  await signInWithPassword(fresh, email, "ein-ganz-anderes-pw");
  await expect(fresh.getByText("E-Mail-Adresse oder Passwort stimmt nicht.")).toBeVisible();
  await signInWithPassword(fresh, email);
  await expect(fresh).not.toHaveURL(/\/login/);
});

test("freemail addresses cannot register", async ({ page }) => {
  await page.goto("/register");
  await page.getByRole("textbox", { name: "Name" }).fill("Max Frei");
  await page.getByRole("textbox", { name: "Firmen-E-Mail" }).fill("max.frei@gmx.de");
  await page.getByLabel("Passwort", { exact: true }).fill(E2E_PASSWORD);
  await page.getByLabel("Passwort wiederholen").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Registrieren" }).click();
  await expect(page.getByText(/Bitte nutze deine Firmen-E-Mail-Adresse/)).toBeVisible();
  // The typed values stay.
  await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue("Max Frei");
});

test("someone else's registration cannot be completed without its password; a new one replaces it", async ({ page }) => {
  const email = `opfer@${uniqueDomain("hijack")}`;
  const since = new Date(Date.now() - 1000);
  await submitRegistration(page, { name: "Angreifer", email, password: "angreifer-pw-123" });
  const attackerLink = await linkFromMail(email, REGISTER_LINK, since);

  // The owner of the inbox registers themselves: the older link stops working.
  const since2 = new Date();
  await submitRegistration(page, { name: "Echte Person", email });
  const ownLink = await linkFromMail(email, REGISTER_LINK, since2);
  expect(ownLink).not.toBe(attackerLink);
  await page.goto(attackerLink);
  await expect(page.getByText("Dieser Link ist abgelaufen oder wurde schon benutzt.", { exact: false })).toBeVisible();

  // Five wrong passwords lock the link.
  await page.goto(ownLink);
  for (let i = 0; i < 5; i++) {
    await page.getByLabel("Passwort", { exact: true }).fill(`falsch-${i}-passwort`);
    // One answer per attempt before the next one (the form resets after each).
    const answered = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/register/confirm"));
    await page.getByRole("button", { name: "Bestätigen und anmelden" }).click();
    await answered;
    if (i < 4) {
      await expect(page.getByText("Das Passwort stimmt nicht.", { exact: false }).first()).toBeVisible();
      // React resets the form after the action; typing before that lands would be wiped (empty submit).
      await expect(page.getByLabel("Passwort", { exact: true })).toHaveValue("");
    }
  }
  await expect(page.getByText("Zu viele falsche Versuche.", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Erneut registrieren" })).toBeVisible();
});

test("an invited person registers and continues to the invitation", async ({ browser }) => {
  const domain = uniqueDomain("reginvite");
  const owner = await browser.newPage();
  const since = new Date(Date.now() - 1000);
  const path = await createWorkspace(owner, `chefin@${domain}`, "Einlader AG", `neu@${domain}`);
  const invite = await linkFromMail(`neu@${domain}`, INVITE_LINK, since);

  const guest = await (await browser.newContext()).newPage();
  await guest.goto(invite);
  // Via the sign-in page: its "Registrieren" link keeps the invitation as next.
  await guest.getByRole("link", { name: "Anmelden und annehmen" }).click();
  await expect(guest).toHaveURL(/\/login\?next=%2Finvite%2F/);
  await guest.getByRole("link", { name: "Registrieren", exact: true }).click();
  await expect(guest).toHaveURL(/\/register\?next=%2Finvite%2F/);
  const since2 = new Date(Date.now() - 1000);
  await guest.getByRole("textbox", { name: "Name" }).fill("Neu Hier");
  await guest.getByRole("textbox", { name: "Firmen-E-Mail" }).fill(`neu@${domain}`);
  await guest.getByLabel("Passwort", { exact: true }).fill(E2E_PASSWORD);
  await guest.getByLabel("Passwort wiederholen").fill(E2E_PASSWORD);
  await guest.getByRole("button", { name: "Registrieren" }).click();
  await expect(guest.getByRole("heading", { name: "Schau in dein Postfach" })).toBeVisible();

  await confirmRegistration(guest, await linkFromMail(`neu@${domain}`, REGISTER_LINK, since2));
  await expect(guest.getByRole("heading", { name: "Einladung zu Einlader AG" })).toBeVisible();
  await guest.getByRole("button", { name: "Annehmen" }).click();
  // The registration name is pre-filled in the joiner wizard.
  await expect(guest.getByRole("textbox", { name: "Dein Name" })).toHaveValue("Neu Hier");
  await completeJoinerWizard(guest);
  await expect(guest).toHaveURL(new RegExp(`${path}/me$`));
});
