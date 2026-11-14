import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { hashPassword: legacyScrypt } = await import("better-auth/crypto");
const { hashPassword, needsRehash, verifyPassword } = await import("./password-hash");

describe("password hashing", () => {
  it("hashes with Argon2id at the configured parameters and a fresh salt each time", async () => {
    const a = await hashPassword("correct horse battery");
    const b = await hashPassword("correct horse battery");
    expect(a).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(a).not.toBe(b);
    expect(needsRehash(a)).toBe(false);
  });

  it("verifies Argon2id hashes and rejects a wrong password", async () => {
    const h = await hashPassword("correct horse battery");
    expect(await verifyPassword({ hash: h, password: "correct horse battery" })).toBe(true);
    expect(await verifyPassword({ hash: h, password: "correct horse batterY" })).toBe(false);
  });

  it("still verifies legacy scrypt hashes and marks them for rehash", async () => {
    const old = await legacyScrypt("old password 123");
    expect(await verifyPassword({ hash: old, password: "old password 123" })).toBe(true);
    expect(await verifyPassword({ hash: old, password: "wrong" })).toBe(false);
    expect(needsRehash(old)).toBe(true);
  });

  it("asks for a rehash when stored parameters are weaker than today's", () => {
    // Argon2id, m=4096 t=1 p=1 – a valid PHC string with weaker parameters.
    const weak = "$argon2id$v=19$m=4096,t=1,p=1$c29tZXNhbHRzb21lc2FsdA$0kSLcg2ZkM6WYzNyfmT7YaW8mNf8rQ2S+5a9xP2x8Lg";
    expect(needsRehash(weak)).toBe(true);
  });

  it("treats a malformed hash as a failed check, not an error", async () => {
    expect(await verifyPassword({ hash: "$argon2id$garbage", password: "x" })).toBe(false);
    expect(await verifyPassword({ hash: "not-a-hash", password: "x" })).toBe(false);
  });
});
