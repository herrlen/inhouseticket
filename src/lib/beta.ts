import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { invitation, user } from "@/db/schema";
import { env } from "@/lib/env";
import { getEmailDomain } from "@/lib/freemail";
import { isExemptEmail } from "@/lib/superadmin";

export const betaClosed = () => env.BETA_ALLOWED_DOMAINS.length > 0;

/**
 * Closed beta gate for sign-in requests: listed domains, existing users and people with an open
 * invitation (e.g. freelancers invited by a beta company) get in; everyone else is refused.
 */
export async function mayEnterBeta(email: string): Promise<boolean> {
  if (!betaClosed()) return true;
  const normalized = email.trim().toLowerCase();
  if (isExemptEmail(normalized)) return true;
  const domain = getEmailDomain(normalized);
  if (domain && env.BETA_ALLOWED_DOMAINS.includes(domain)) return true;
  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, normalized)).limit(1);
  if (existing) return true;
  const [invited] = await db
    .select({ id: invitation.id })
    .from(invitation)
    .where(and(eq(invitation.email, normalized), isNull(invitation.acceptedAt), gt(invitation.expiresAt, new Date())))
    .limit(1);
  return Boolean(invited);
}

/** Refusal for a sign-up outside the allowed domains: closed beta, or a company instance (SELF_HOSTED). */
export const closedMessage = (t: { auth: { betaClosed: string; instanceClosed: string } }) => (env.SELF_HOSTED ? t.auth.instanceClosed : t.auth.betaClosed);
