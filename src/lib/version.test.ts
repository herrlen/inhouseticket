import { describe, expect, it } from "vitest";
import { shortVersion } from "./version";

describe("shortVersion", () => {
  it("cuts a commit build to seven hex characters, like scripts/deploy.sh expects", () => {
    expect(shortVersion("sha-1776b10a9d6568760456c00c3f0e2b9e1a2b3c4d")).toBe("sha-1776b10");
  });
  it("leaves other values alone", () => {
    expect(shortVersion(undefined)).toBe("dev");
    expect(shortVersion("dev")).toBe("dev");
  });
});
