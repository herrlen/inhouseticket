import { describe, expect, it } from "vitest";
import {
  ACCOUNT_EXISTS_MAILS_PER_EMAIL,
  REGISTRATION_CONFIRMS_PER_IP,
  REGISTRATION_TTL_MS,
  REGISTRATION_WINDOW_MS,
  REGISTRATIONS_PER_EMAIL,
  REGISTRATIONS_PER_IP,
} from "@/lib/limits";
import { loginHref, registerHref } from "./auth-links";
import {
  clientIp,
  confirmRegistrationUrl,
  registrationExpiresAt,
  takeAccountExistsMail,
  takeConfirmAttempt,
  takeRegistrationRequest,
} from "./registration";

describe("registration link", () => {
  it("expires after the TTL from limits.ts (24 hours)", () => {
    expect(REGISTRATION_TTL_MS).toBe(24 * 60 * 60_000);
    expect(registrationExpiresAt(1_000).getTime()).toBe(1_000 + REGISTRATION_TTL_MS);
  });

  it("points at the confirm page with the token as query", () => {
    const url = new URL(confirmRegistrationUrl("https://inhouseticket.com", "abc_DEF-123"));
    expect(url.origin + url.pathname).toBe("https://inhouseticket.com/register/confirm");
    expect(url.searchParams.get("token")).toBe("abc_DEF-123");
  });
});

describe("registration limits", () => {
  it("allows a few requests per address, then refuses – independent of other addresses", () => {
    const t0 = 10_000_000;
    for (let i = 0; i < REGISTRATIONS_PER_EMAIL; i++) expect(takeRegistrationRequest(`10.0.0.${i}`, "a@firma.de", t0 + i)).toBe(true);
    expect(takeRegistrationRequest("10.0.1.1", "A@Firma.de", t0 + 10)).toBe(false);
    expect(takeRegistrationRequest("10.0.1.1", "b@firma.de", t0 + 10)).toBe(true);
    expect(takeRegistrationRequest("10.0.1.2", "a@firma.de", t0 + REGISTRATION_WINDOW_MS)).toBe(true);
  });

  it("limits one IP across many addresses", () => {
    const t0 = 20_000_000;
    for (let i = 0; i < REGISTRATIONS_PER_IP; i++) expect(takeRegistrationRequest("10.9.9.9", `p${i}@firma.de`, t0 + i)).toBe(true);
    expect(takeRegistrationRequest("10.9.9.9", "fresh@firma.de", t0 + 50)).toBe(false);
    expect(takeRegistrationRequest("10.9.9.8", "fresh@firma.de", t0 + 50)).toBe(true);
  });

  it("sends the 'already an account' mail at most once per window", () => {
    const t0 = 30_000_000;
    for (let i = 0; i < ACCOUNT_EXISTS_MAILS_PER_EMAIL; i++) expect(takeAccountExistsMail("x@firma.de", t0)).toBe(true);
    expect(takeAccountExistsMail("x@firma.de", t0 + 1)).toBe(false);
    expect(takeAccountExistsMail("x@firma.de", t0 + REGISTRATION_WINDOW_MS)).toBe(true);
  });

  it("caps confirm attempts per IP", () => {
    const t0 = 40_000_000;
    for (let i = 0; i < REGISTRATION_CONFIRMS_PER_IP; i++) expect(takeConfirmAttempt("10.7.7.7", t0 + i)).toBe(true);
    expect(takeConfirmAttempt("10.7.7.7", t0 + 100)).toBe(false);
  });
});

describe("clientIp", () => {
  it("takes the first X-Forwarded-For address, then X-Real-IP", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": " 1.2.3.4 , 10.0.0.1" }))).toBe("1.2.3.4");
    expect(clientIp(new Headers({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(clientIp(new Headers())).toBe("");
  });
});

describe("links between sign-in and registration", () => {
  it("keep a target other than /start", () => {
    expect(registerHref("/start")).toBe("/register");
    expect(loginHref("/start")).toBe("/login");
    expect(registerHref("/invite/abc")).toBe("/register?next=%2Finvite%2Fabc");
    expect(loginHref("/invite/abc")).toBe("/login?next=%2Finvite%2Fabc");
  });
});
