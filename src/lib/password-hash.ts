import "server-only";
import { hash, parseOptions, verify } from "@node-rs/argon2";
import { verifyPassword as verifyScrypt } from "better-auth/crypto";

/**
 * Password hashing for Better Auth (emailAndPassword.password) and the pending registration:
 * Argon2id with the OWASP baseline (19 MiB, 2 passes, 1 lane) – sized for the 512 MB container.
 * Hashes from before 2026-11 are Better Auth's scrypt (`salt:key` in hex); they still verify and
 * are replaced with Argon2id at the next successful password sign-in (src/lib/auth.ts).
 */
export const ARGON2 = {
  // Algorithm.Argon2id – the package exports it as a const enum, which isolatedModules cannot inline.
  algorithm: 2,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

const ARGON2ID_PREFIX = "$argon2id$";

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2);
}

/** Constant-time comparison inside both libraries; false (never a throw) for a malformed hash. */
export async function verifyPassword({ hash: stored, password }: { hash: string; password: string }): Promise<boolean> {
  try {
    if (stored.startsWith(ARGON2ID_PREFIX)) return await verify(stored, password);
    return await verifyScrypt({ hash: stored, password });
  } catch {
    return false;
  }
}

/** True for legacy scrypt hashes and for Argon2id below the current parameters. */
export function needsRehash(stored: string): boolean {
  if (!stored.startsWith(ARGON2ID_PREFIX)) return true;
  try {
    const p = parseOptions(stored);
    return p.memoryCost < ARGON2.memoryCost || p.timeCost < ARGON2.timeCost || p.parallelism < ARGON2.parallelism;
  } catch {
    return true;
  }
}
