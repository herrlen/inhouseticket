import "server-only";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { account, user } from "@/db/schema";
import type { PasswordState } from "@/lib/no-password-link";

// Password state of a person. Auth tables belong to the person, not a workspace, so there is no
// workspace scope here (same as Better Auth's own session lookups).

/** True once the person has set a password (Better Auth's "credential" account with a hash). */
export async function userHasPassword(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential"), isNotNull(account.password)))
    .limit(1);
  return Boolean(row);
}

/** Password state of an address (lower-cased), without revealing it to anyone but the caller. */
export async function passwordStateByEmail(email: string): Promise<PasswordState> {
  const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, email.trim().toLowerCase())).limit(1);
  if (!row) return "noAccount";
  return (await userHasPassword(row.id)) ? "hasPassword" : "noPassword";
}
