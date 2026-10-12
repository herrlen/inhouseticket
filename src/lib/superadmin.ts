import "server-only";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { requireUser } from "@/lib/session";

// Platform operator (Len Messerschmidt e.K.). Configured per deployment via SUPERADMIN_EMAILS, never in code.
// Sees workspace metadata on /admin – never ticket content.

export function isSuperadminEmail(email: string): boolean {
  return env.SUPERADMIN_EMAILS.includes(email.trim().toLowerCase());
}

/**
 * Addresses exempt from the freemail block and the closed beta: operators plus individual
 * testers (TESTER_EMAILS). Testers get nothing else – no /admin.
 */
export function isExemptEmail(email: string): boolean {
  return isSuperadminEmail(email) || env.TESTER_EMAILS.includes(email.trim().toLowerCase());
}

/** Everyone else gets a 404, so /admin does not reveal itself. */
export async function requireSuperadmin() {
  const user = await requireUser("/admin");
  if (!isSuperadminEmail(user.email)) notFound();
  return user;
}
