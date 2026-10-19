import { describe, expect, it } from "vitest";
import { NO_ACCOUNT_MAIL_WINDOW_MS, NO_ACCOUNT_MAILS_PER_EMAIL } from "./limits";
import { noAccountRegisterUrl, takeNoAccountMail } from "./no-account-mail";

const APP = "https://inhouseticket.com";
const verify = (callbackURL?: string) => {
  const url = new URL("/api/auth/magic-link/verify", APP);
  url.searchParams.set("token", "abc");
  if (callbackURL !== undefined) url.searchParams.set("callbackURL", callbackURL);
  return url.toString();
};

describe("takeNoAccountMail", () => {
  it("allows one mail per address and window, then again after the window", () => {
    const now = Date.now();
    const email = `nobody-${now}@firma.de`;
    for (let i = 0; i < NO_ACCOUNT_MAILS_PER_EMAIL; i++) expect(takeNoAccountMail(email, now)).toBe(true);
    expect(takeNoAccountMail(email, now + 1000)).toBe(false);
    expect(takeNoAccountMail(email.toUpperCase(), now + 1000)).toBe(false);
    expect(takeNoAccountMail(email, now + NO_ACCOUNT_MAIL_WINDOW_MS)).toBe(true);
  });
});

describe("noAccountRegisterUrl", () => {
  it("links to /register with the address and keeps an invitation as next", () => {
    const url = new URL(noAccountRegisterUrl(APP, " Neu@Firma.DE ", verify("/invite/tok-123")));
    expect(url.origin + url.pathname).toBe(`${APP}/register`);
    expect(url.searchParams.get("email")).toBe("neu@firma.de");
    expect(url.searchParams.get("next")).toBe("/invite/tok-123");
  });

  it("keeps a connector login (authorize endpoint with query)", () => {
    const authorize = "/api/auth/oauth2/authorize?client_id=c1&redirect_uri=https%3A%2F%2Fclaude.ai%2Fcb&state=s";
    expect(new URL(noAccountRegisterUrl(APP, "a@firma.de", verify(authorize))).searchParams.get("next")).toBe(authorize);
  });

  it.each([undefined, "/", "/start", "https://evil.example/x", "//evil.example", "/\\evil.example"])(
    "drops the default or a foreign target %j",
    (callbackURL) => {
      expect(new URL(noAccountRegisterUrl(APP, "a@firma.de", verify(callbackURL))).searchParams.has("next")).toBe(false);
    },
  );
});
