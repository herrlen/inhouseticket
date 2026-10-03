import { describe, expect, it } from "vitest";
import { getEmailDomain, isCompanyEmail, isFreemailDomain } from "./freemail";

describe("getEmailDomain", () => {
  it("normalizes case and whitespace", () => {
    expect(getEmailDomain("  Max@Firma.DE ")).toBe("firma.de");
  });

  it("strips a trailing dot", () => {
    expect(getEmailDomain("max@firma.de.")).toBe("firma.de");
  });

  it.each(["", "max", "max@", "@firma.de", "max@firma", "max@@firma.de", "max@.firma.de", "max@firma..de", "ma x@firma.de"])(
    "rejects malformed address %j",
    (email) => {
      expect(getEmailDomain(email)).toBeNull();
    },
  );
});

describe("isFreemailDomain", () => {
  it("matches listed domains and their subdomains", () => {
    expect(isFreemailDomain("gmx.de")).toBe(true);
    expect(isFreemailDomain("mail.gmx.de")).toBe(true);
  });

  it("does not match lookalike company domains", () => {
    expect(isFreemailDomain("gmx-consulting.de")).toBe(false);
    expect(isFreemailDomain("notgmail.com")).toBe(false);
  });
});

describe("isCompanyEmail", () => {
  it.each([
    "max@gmail.com",
    "max@googlemail.com",
    "max@GMX.de",
    "max@web.de",
    "max@t-online.de",
    "max@outlook.com",
    "max@hotmail.de",
    "max@yahoo.com",
    "max@icloud.com",
    "max@proton.me",
    "max@freenet.de",
    "max@mail.de",
    "max@yopmail.com",
  ])("rejects freemail %s", (email) => {
    expect(isCompanyEmail(email)).toBe(false);
  });

  it.each(["max@agentur-beispiel.de", "anna.schmidt@firma.co.uk", "it@sub.firma.de"])(
    "accepts company address %s",
    (email) => {
      expect(isCompanyEmail(email)).toBe(true);
    },
  );

  it("rejects malformed addresses", () => {
    expect(isCompanyEmail("kein-at-zeichen.de")).toBe(false);
  });
});
