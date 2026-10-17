import { describe, expect, it } from "vitest";
import { NO_PASSWORD_LINK_WINDOW_MS, NO_PASSWORD_LINKS_PER_EMAIL } from "./limits";
import { failedSignInEmail, shouldSendNoPasswordLink } from "./no-password-link";

describe("failedSignInEmail", () => {
  it("takes the address of a 401 answer, normalized", () => {
    expect(failedSignInEmail(401, "  Nora@Firma.DE ")).toBe("nora@firma.de");
  });

  it.each([
    [429, "nora@firma.de"],
    [400, "nora@firma.de"],
    [500, "nora@firma.de"],
    [200, "nora@firma.de"],
    [undefined, "nora@firma.de"],
    [401, undefined],
    [401, 42],
    [401, "kein-at-zeichen"],
  ])("ignores status %j with address %j", (status, email) => {
    expect(failedSignInEmail(status, email)).toBeNull();
  });
});

describe("shouldSendNoPasswordLink", () => {
  const t0 = 5_000_000;

  it("limit: one link per address and 15 minutes", () => {
    expect(NO_PASSWORD_LINKS_PER_EMAIL).toBe(1);
    expect(NO_PASSWORD_LINK_WINDOW_MS).toBe(15 * 60_000);
  });

  it("never mails unknown addresses or accounts with a password", () => {
    for (let i = 0; i < 3; i++) {
      expect(shouldSendNoPasswordLink("unknown@firma.de", "noAccount", t0 + i)).toBe(false);
      expect(shouldSendNoPasswordLink("has@firma.de", "hasPassword", t0 + i)).toBe(false);
    }
  });

  it("mails an account without a password once per window", () => {
    expect(shouldSendNoPasswordLink("nopw@firma.de", "noPassword", t0)).toBe(true);
    expect(shouldSendNoPasswordLink("nopw@firma.de", "noPassword", t0 + 1000)).toBe(false);
    expect(shouldSendNoPasswordLink("nopw@firma.de", "noPassword", t0 + NO_PASSWORD_LINK_WINDOW_MS - 1)).toBe(false);
    expect(shouldSendNoPasswordLink("nopw@firma.de", "noPassword", t0 + NO_PASSWORD_LINK_WINDOW_MS)).toBe(true);
    // Per address: another person is not blocked.
    expect(shouldSendNoPasswordLink("other@firma.de", "noPassword", t0 + 1000)).toBe(true);
  });

  it("a lookup while the account still had a password does not use up the limit", () => {
    expect(shouldSendNoPasswordLink("later@firma.de", "hasPassword", t0)).toBe(false);
    expect(shouldSendNoPasswordLink("later@firma.de", "noPassword", t0 + 1)).toBe(true);
  });
});
