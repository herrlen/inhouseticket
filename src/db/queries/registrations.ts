import "server-only";
import { and, eq, gt, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { pendingRegistration } from "@/db/schema";
import { MAX_REGISTRATION_ATTEMPTS } from "@/lib/limits";

// Pending registrations (ADR 005). They belong to an address, not a workspace – there is no
// workspace scope here (like Better Auth's own verification table). Addresses arrive lower-cased.

export type PendingRegistration = typeof pendingRegistration.$inferSelect;

/** Stores a registration; an older one for the same address is replaced (its link stops working). */
export async function upsertPendingRegistration(row: {
  email: string;
  name: string;
  passwordHash: string;
  tokenHash: string;
  next: string | null;
  expiresAt: Date;
}): Promise<void> {
  await db
    .insert(pendingRegistration)
    .values(row)
    .onConflictDoUpdate({
      target: pendingRegistration.email,
      set: {
        name: row.name,
        passwordHash: row.passwordHash,
        tokenHash: row.tokenHash,
        next: row.next,
        expiresAt: row.expiresAt,
        failedAttempts: 0,
        createdAt: sql`now()`,
      },
    });
}

/** Read-only lookup for the confirm page (a GET consumes nothing): the address of a live link. */
export async function findPendingByTokenHash(tokenHash: string, now = new Date()): Promise<{ email: string } | null> {
  const [row] = await db
    .select({ email: pendingRegistration.email })
    .from(pendingRegistration)
    .where(
      and(
        eq(pendingRegistration.tokenHash, tokenHash),
        gt(pendingRegistration.expiresAt, now),
        lt(pendingRegistration.failedAttempts, MAX_REGISTRATION_ATTEMPTS),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Counts one confirmation attempt before the password is checked, so parallel guesses cannot
 * exceed the limit. Null when the link is unknown, expired or already used up.
 */
export async function claimConfirmAttempt(tokenHash: string, now = new Date()): Promise<PendingRegistration | null> {
  const [row] = await db
    .update(pendingRegistration)
    .set({ failedAttempts: sql`${pendingRegistration.failedAttempts} + 1` })
    .where(
      and(
        eq(pendingRegistration.tokenHash, tokenHash),
        gt(pendingRegistration.expiresAt, now),
        lt(pendingRegistration.failedAttempts, MAX_REGISTRATION_ATTEMPTS),
      ),
    )
    .returning();
  return row ?? null;
}

/** Takes the registration out (single use): only one of two parallel confirmations gets the row. */
export async function consumePendingRegistration(id: string): Promise<PendingRegistration | null> {
  const [row] = await db.delete(pendingRegistration).where(eq(pendingRegistration.id, id)).returning();
  return row ?? null;
}

/** A link that used up its attempts is gone for good. */
export async function deleteLockedRegistration(id: string): Promise<void> {
  await db
    .delete(pendingRegistration)
    .where(and(eq(pendingRegistration.id, id), sql`${pendingRegistration.failedAttempts} >= ${MAX_REGISTRATION_ATTEMPTS}`));
}

/** Once an account exists for the address (by any path), an older registration is moot. */
export async function deletePendingForEmail(email: string): Promise<void> {
  await db.delete(pendingRegistration).where(eq(pendingRegistration.email, email.trim().toLowerCase()));
}

/** Retention (privacy policy): expired registrations are deleted, returns how many. */
export async function deleteExpiredRegistrations(now = new Date()): Promise<number> {
  const rows = await db.delete(pendingRegistration).where(lte(pendingRegistration.expiresAt, now)).returning({ id: pendingRegistration.id });
  return rows.length;
}
