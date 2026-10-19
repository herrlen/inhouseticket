import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  completeOwnerWizard,
  createAccountWithoutPassword,
  createWorkspace,
  ONBOARDING_URL,
  E2E_PASSWORD,
  linkFromMail,
  MAGIC_LINK,
  mailCount,
  NO_ACCOUNT_LINK,
  mailText,
  RESET_LINK,
  openMagicLink,
  requestMagicLink,
  setPassword,
  signInWithPassword,
  uniqueDomain,
} from "./helpers/auth";

const INVALID = "E-Mail-Adresse oder Passwort stimmt nicht.";
const NO_PASSWORD_HINT = "Falls dein Konto noch kein Passwort hat, haben wir dir gerade einen Link geschickt, mit dem du eins festlegst.";
/** The sign-in link goes out after the response; give it time before asserting "no mail". */
const MAIL_GRACE_MS = 2000;

/** Session state straight from the database, past Better Auth's 5-minute cookie cache. */
async function hasLiveSession(page: Page): Promise<boolean> {
  const res = await page.context().request.get("/api/auth/get-session?disableCookieCache=true");
  return (await res.json()) !== null;
}

test("link sign-in without a password: set it first, no way around", async ({ page }) => {
  const email = `nora@${uniqueDomain("setpw")}`;
  await createAccountWithoutPassword(page, email);
  await openMagicLink(page, await requestMagicLink(page, email));
  await expect(page).toHaveURL(/\/set-password$/);

  // Every other page and the API send the person back.
  await page.goto("/start");
  await expect(page).toHaveURL(/\/set-password$/);
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/set-password\?next=%2Fonboarding$/);
  const api = await page.context().request.get("/api/w/00000000-0000-4000-8000-000000000000/search?q=x");
  expect(api.status()).toBe(403);

  // Checks in the browser, keyboard only.
  await page.getByLabel("Neues Passwort").fill("zu-kurz");
  await page.getByLabel("Passwort wiederholen").fill("zu-kurz");
  await page.getByLabel("Passwort wiederholen").press("Enter");
  await expect(page.getByText("Mindestens 10 Zeichen.", { exact: true }).last()).toBeVisible();
  await page.getByLabel("Neues Passwort").fill("lang-genug-123");
  await page.getByLabel("Passwort wiederholen").fill("lang-genug-456");
  await page.getByLabel("Passwort wiederholen").press("Enter");
  await expect(page.getByText("Die Passwörter stimmen nicht überein.")).toBeVisible();

  // WCAG A/AA on the page nobody gets around, light and dark. Reduced motion switches transitions
  // off, so axe never measures a button halfway between its light and dark colors.
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .exclude("nextjs-portal") // dev badge
      .analyze();
    expect(violations.map((v) => `${colorScheme}: ${v.id}`)).toEqual([]);
  }

  // Show/hide toggle.
  const field = page.getByLabel("Neues Passwort");
  await expect(field).toHaveAttribute("type", "password");
  await expect(field).toHaveAttribute("autocomplete", "new-password");
  await page.getByRole("button", { name: "Passwort anzeigen" }).first().click();
  await expect(field).toHaveAttribute("type", "text");

  await setPassword(page);
  await expect(page).toHaveURL(ONBOARDING_URL);
  await page.goto("/set-password");
  await expect(page).toHaveURL(ONBOARDING_URL);
});

test("password sign-in: right password gets in, wrong ones and unknown addresses get the same answer", async ({ page, browser }) => {
  const domain = uniqueDomain("pwlogin");
  const path = await createWorkspace(page, `lars@${domain}`, "Login KG");

  const other = await (await browser.newContext()).newPage();
  const since = new Date(Date.now() - 1000);
  await signInWithPassword(other, `lars@${domain}`, "falsches-passwort");
  await expect(other.getByRole("alert").filter({ hasText: INVALID })).toContainText(NO_PASSWORD_HINT);
  await signInWithPassword(other, `niemand@${domain}`, "irgendein-passwort");
  await expect(other.getByRole("alert").filter({ hasText: INVALID })).toContainText(NO_PASSWORD_HINT);
  // Account with a password and unknown address: no mail.
  await other.waitForTimeout(MAIL_GRACE_MS);
  expect(await mailCount(`lars@${domain}`, since)).toBe(0);
  expect(await mailCount(`niemand@${domain}`, since)).toBe(0);

  await signInWithPassword(other, `lars@${domain}`, E2E_PASSWORD);
  await expect(other).toHaveURL(new RegExp(`${path}$`));
  await expect(other.getByRole("heading", { name: "Willkommen bei Login KG" })).toBeVisible();
});

test("account without a password: password attempt shows the box, mails a link, then a password is set", async ({ page, browser }) => {
  const domain = uniqueDomain("nopw");
  const email = `ole@${domain}`;
  // Signed in by link once, never set a password (an account from before registration existed).
  await createAccountWithoutPassword(page, email);
  await openMagicLink(page, await requestMagicLink(page, email));
  await expect(page).toHaveURL(/\/set-password$/);

  const other = await (await browser.newContext()).newPage();
  const since = new Date(Date.now() - 1000);
  await signInWithPassword(other, email, "irgendein-passwort");
  const box = other.getByRole("alert").filter({ hasText: INVALID });
  await expect(box).toContainText(NO_PASSWORD_HINT);
  await expect(other.getByLabel("Passwort", { exact: true })).toHaveValue("");
  await expect(other.getByRole("button", { name: "Anmeldelink an diese Adresse senden" })).toBeVisible();
  expect(new URL(other.url()).search).toBe("");

  const text = await mailText(email, since);
  expect(text).toContain("aber für dein Konto ist noch keins festgelegt");
  const link = text.match(MAGIC_LINK)?.[0];
  expect(link).toBeTruthy();

  // A second attempt shows the box again, but no second mail (one per 15 minutes).
  await other.getByLabel("Passwort", { exact: true }).fill("noch-ein-versuch");
  await other.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(other.getByRole("alert").filter({ hasText: INVALID })).toBeVisible();
  await other.waitForTimeout(MAIL_GRACE_MS);
  expect(await mailCount(email, since)).toBe(1);

  await openMagicLink(other, link!);
  await expect(other).toHaveURL(/\/set-password$/);
  await setPassword(other);
  await expect(other).toHaveURL(ONBOARDING_URL);
  await completeOwnerWizard(other, "Ohne Passwort KG");

  // From now on the password works.
  const fresh = await (await browser.newContext()).newPage();
  await signInWithPassword(fresh, email, E2E_PASSWORD);
  await expect(fresh.getByRole("heading", { name: "Willkommen bei Ohne Passwort KG" })).toBeVisible();
});

test("the box's button mails the typed address (no account: the hint to register)", async ({ page }) => {
  const email = `pia@${uniqueDomain("boxlink")}`;
  await signInWithPassword(page, email, "irgendein-passwort");
  await expect(page.getByRole("alert").filter({ hasText: INVALID })).toBeVisible();
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(violations.map((v) => `${colorScheme}: ${v.id}`)).toEqual([]);
  }
  const since = new Date(Date.now() - 1000);
  await page.getByRole("button", { name: "Anmeldelink an diese Adresse senden" }).click();
  await expect(page.getByRole("heading", { name: "Schau in dein Postfach" })).toBeVisible();
  expect(await linkFromMail(email, NO_ACCOUNT_LINK, since)).toBeTruthy();
});

test("auth forms before hydration: no submit, and never a password in the URL", async ({ browser }) => {
  const page = await (await browser.newContext({ javaScriptEnabled: false })).newPage();
  await page.goto("/login");
  const submit = page.getByRole("button", { name: "Anmelden", exact: true });
  await expect(submit).toBeDisabled();
  await expect(page.locator("form:has(input[name=password])")).toHaveAttribute("method", "post");
  await page.getByRole("textbox", { name: "Firmen-E-Mail" }).fill("nora@firma.de");
  await page.getByLabel("Passwort", { exact: true }).fill("geheim-und-lang");
  await page.getByLabel("Passwort", { exact: true }).press("Enter");
  expect(page.url()).not.toContain("geheim");

  await page.goto("/forgot-password");
  await expect(page.getByRole("button", { name: "Link zum Zurücksetzen senden" })).toBeDisabled();
  await expect(page.locator("form:has(input[name=email])")).toHaveAttribute("method", "post");
  await page.goto("/register");
  await expect(page.getByRole("button", { name: "Registrieren" })).toBeDisabled();
  await expect(page.locator("form:has(input[name=password])")).toHaveAttribute("method", /post/i);
  await page.getByLabel("Passwort", { exact: true }).fill("geheim-und-lang");
  await page.getByLabel("Passwort", { exact: true }).press("Enter");
  expect(page.url()).not.toContain("geheim");
});

test("change password in the settings ends other sessions", async ({ page, browser }) => {
  const email = `clara@${uniqueDomain("changepw")}`;
  const path = await createWorkspace(page, email, "Wechsel AG");
  const laptop = await (await browser.newContext()).newPage();
  await signInWithPassword(laptop, email);
  await expect(laptop).toHaveURL(new RegExp(`${path}$`));

  await page.getByRole("button", { name: /Konto von/ }).click();
  await page.getByRole("menuitem", { name: "Konto" }).click();
  await expect(page.getByRole("heading", { name: "Konto", level: 1 })).toBeVisible();
  await expect(page.getByLabel("Aktuelles Passwort")).toHaveAttribute("autocomplete", "current-password");

  await page.getByLabel("Aktuelles Passwort").fill("nicht-das-richtige");
  await page.getByLabel("Neues Passwort").fill("neues-passwort-42");
  await page.getByLabel("Passwort wiederholen").fill("neues-passwort-42");
  await page.getByRole("button", { name: "Passwort ändern" }).click();
  await expect(page.getByText("Das aktuelle Passwort stimmt nicht.")).toBeVisible();

  await page.getByLabel("Aktuelles Passwort").fill(E2E_PASSWORD);
  await page.getByLabel("Neues Passwort").fill("neues-passwort-42");
  await page.getByLabel("Passwort wiederholen").fill("neues-passwort-42");
  await page.getByRole("button", { name: "Passwort ändern" }).click();
  await expect(page.getByText("Passwort geändert. Andere Geräte wurden abgemeldet.")).toBeVisible();

  expect(await hasLiveSession(page)).toBe(true);
  expect(await hasLiveSession(laptop)).toBe(false);

  const fresh = await (await browser.newContext()).newPage();
  await signInWithPassword(fresh, email, E2E_PASSWORD);
  await expect(fresh.getByText(INVALID)).toBeVisible();
  await signInWithPassword(fresh, email, "neues-passwort-42");
  await expect(fresh).toHaveURL(new RegExp(`${path}$`));
});

test("forgot password: reset link by mail, single use, then sign in with the new one", async ({ page, browser }) => {
  const domain = uniqueDomain("resetpw");
  const email = `rita@${domain}`;
  const path = await createWorkspace(page, email, "Reset GmbH");

  const other = await (await browser.newContext()).newPage();
  await other.goto("/login");
  await other.getByRole("link", { name: "Passwort vergessen?" }).click();
  await expect(other.getByRole("heading", { name: "Passwort vergessen" })).toBeVisible();

  // Unknown address: the same answer, and no mail.
  await other.getByRole("textbox", { name: "Firmen-E-Mail" }).fill(`unbekannt@${domain}`);
  await other.getByRole("button", { name: "Link zum Zurücksetzen senden" }).click();
  await expect(other.getByText(/Falls es für unbekannt@/)).toBeVisible();

  await other.goto("/forgot-password");
  const since = new Date(Date.now() - 1000);
  await other.getByRole("textbox", { name: "Firmen-E-Mail" }).fill(email);
  await other.getByRole("button", { name: "Link zum Zurücksetzen senden" }).click();
  await expect(other.getByText(/Falls es für rita@/)).toBeVisible();
  const link = await linkFromMail(email, RESET_LINK, since);

  await other.goto(link);
  await expect(other.getByRole("heading", { name: "Neues Passwort festlegen" })).toBeVisible();
  await expect(other).toHaveURL(/\/reset-password$/); // token is dropped from the address bar
  await other.getByLabel("Neues Passwort").fill("frisch-gesetzt-77");
  await other.getByLabel("Passwort wiederholen").fill("frisch-gesetzt-77");
  await other.getByRole("button", { name: "Passwort speichern" }).click();
  await expect(other.getByText(/Dein Passwort ist gespeichert/)).toBeVisible();

  // All sessions ended, the link works once.
  expect(await hasLiveSession(page)).toBe(false);
  await other.goto(link);
  await expect(other.getByText(/abgelaufen oder wurde schon benutzt/)).toBeVisible();

  await signInWithPassword(other, email, "frisch-gesetzt-77");
  await expect(other).toHaveURL(new RegExp(`${path}$`));
});

test("settings: 'Passwort zurücksetzen' mails a link to the own address", async ({ page }) => {
  const email = `sven@${uniqueDomain("settingsreset")}`;
  const path = await createWorkspace(page, email, "Knopf GmbH");
  await page.goto(`${path}/settings/account`);
  const since = new Date(Date.now() - 1000);
  await page.getByRole("button", { name: "Passwort zurücksetzen" }).click();
  await expect(page.getByText(`Link an ${email} geschickt. Er ist 30 Minuten gültig.`)).toBeVisible();
  expect(await linkFromMail(email, RESET_LINK, since)).toContain("callbackURL=%2Freset-password");
});
