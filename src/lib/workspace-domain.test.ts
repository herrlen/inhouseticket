import { describe, expect, it } from "vitest";
import { isPersonalWorkspaceDomain, workspaceDomainOf } from "./workspace-domain";

describe("workspaceDomainOf", () => {
  it("uses the company domain", () => {
    expect(workspaceDomainOf("Anna@Firma.de")).toBe("firma.de");
    expect(isPersonalWorkspaceDomain("firma.de")).toBe(false);
  });

  it("keys a freemail (operator) workspace by the full address, never by the provider", () => {
    expect(workspaceDomainOf(" Len.Messerschmidt@gmail.com ")).toBe("len.messerschmidt@gmail.com");
    expect(isPersonalWorkspaceDomain("len.messerschmidt@gmail.com")).toBe(true);
  });

  it("rejects malformed addresses", () => {
    expect(workspaceDomainOf("kein-at")).toBeNull();
  });
});
