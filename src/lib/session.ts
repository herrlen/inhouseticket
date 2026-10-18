import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { userHasPassword } from "@/db/queries/credentials";
import { auth } from "@/lib/auth";
import { setPasswordUrl } from "@/lib/password-gate";

/** Current session or null; deduplicated per request. */
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

/** Whether the person has set a password; deduplicated per request. */
export const hasPassword = cache(async (userId: string) => userHasPassword(userId));

/**
 * Current user; redirects to the login page when signed out and to the set-password page when
 * the person has no password yet (every account has one, CLAUDE.md "Auth"). Only the
 * set-password page itself passes `allowWithoutPassword`.
 */
export async function requireUser(next?: string, opts: { allowWithoutPassword?: boolean } = {}) {
  const session = await getSession();
  if (!session) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  if (!opts.allowWithoutPassword && !(await hasPassword(session.user.id))) redirect(setPasswordUrl(next ?? "/start"));
  return session.user;
}

export { safeNext } from "@/lib/safe-next";
