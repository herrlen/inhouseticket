import { describe, expect, it } from "vitest";
import { credentialsAad, CredentialsError, openCredentials, sealCredentials, tokenHint } from "./crypto";

const SECRET = "test-secret-with-at-least-32-characters-0123";
const TOKEN = "pk_1234567_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345";
const AAD = credentialsAad("7f0c7d1e-0000-4000-8000-000000000001");

describe("integration credentials", () => {
  it("round-trips and never contains the plaintext", () => {
    const sealed = sealCredentials(TOKEN, AAD, SECRET);
    expect(sealed).toMatch(/^v1:[\w-]{16}:[\w-]+$/);
    expect(sealed).not.toContain(TOKEN);
    expect(sealed).not.toContain("pk_");
    expect(openCredentials(sealed, AAD, SECRET)).toBe(TOKEN);
  });

  it("uses a fresh IV every time", () => {
    expect(sealCredentials(TOKEN, AAD, SECRET)).not.toBe(sealCredentials(TOKEN, AAD, SECRET));
  });

  it("binds the ciphertext to its row (AAD)", () => {
    const sealed = sealCredentials(TOKEN, AAD, SECRET);
    expect(() => openCredentials(sealed, credentialsAad("another-row"), SECRET)).toThrow(CredentialsError);
  });

  it("rejects another key, tampering and unknown versions", () => {
    const sealed = sealCredentials(TOKEN, AAD, SECRET);
    expect(() => openCredentials(sealed, AAD, `${SECRET}x`)).toThrow("credentials_unreadable");
    const [v, iv, body] = sealed.split(":");
    const flipped = Buffer.from(body!, "base64url");
    flipped[0] = flipped[0]! ^ 1;
    expect(() => openCredentials(`${v}:${iv}:${flipped.toString("base64url")}`, AAD, SECRET)).toThrow("credentials_unreadable");
    expect(() => openCredentials(`v2:${iv}:${body}`, AAD, SECRET)).toThrow("credentials_malformed");
    expect(() => openCredentials("garbage", AAD, SECRET)).toThrow("credentials_malformed");
  });

  it("refuses to work without a proper secret", () => {
    expect(() => sealCredentials(TOKEN, AAD, "")).toThrow("credentials_no_secret");
    expect(() => sealCredentials(TOKEN, AAD, "short")).toThrow("credentials_no_secret");
  });

  it("shows only prefix and last four characters", () => {
    expect(tokenHint(TOKEN)).toBe("pk_…2345");
    expect(tokenHint("  abcdefghijkl ")).toBe("…ijkl");
  });
});
