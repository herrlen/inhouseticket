import { describe, expect, it } from "vitest";
import { nameFromEmail, workspaceNameFromDomain } from "./names";

describe("nameFromEmail", () => {
  it.each([
    ["max.mustermann@firma.de", "Max Mustermann"],
    ["anna_schmidt@firma.de", "Anna Schmidt"],
    ["it@firma.de", "It"],
    ["j-p.weber+tickets@firma.de", "J P Weber Tickets"],
    ["@firma.de", "@firma.de"],
  ])("%s → %s", (email, name) => {
    expect(nameFromEmail(email)).toBe(name);
  });
});

describe("workspaceNameFromDomain", () => {
  it.each([
    ["ursalz.de", "Ursalz"],
    ["mein-shop.co.uk", "Mein Shop"],
    ["it.firma.de", "It Firma"],
    ["müller.de", "Mueller"],
    ["len.mueller@gmail.com", "Mueller"],
    ["x.de", "Workspace"],
  ])("%s → %s", (domain, name) => {
    expect(workspaceNameFromDomain(domain)).toBe(name);
  });
});
