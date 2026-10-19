import "server-only";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";
import {
  claimConfirmAttempt,
  consumePendingRegistration,
  deleteLockedRegistration,
} from "@/db/queries/registrations";
import { mayEnterBeta } from "@/lib/beta";
import { isCompanyEmail } from "@/lib/freemail";
import { MAX_PASSWORD, MAX_REGISTRATION_ATTEMPTS } from "@/lib/limits";
import { safeNext } from "@/lib/safe-next";
import { isExemptEmail } from "@/lib/superadmin";
import { hashToken } from "@/lib/tokens";

/** Source of users created by the confirm endpoint – the only one `user.validateUserInfo` admits. */
export const REGISTRATION_METHOD = "registration";

/** Stable codes the confirm action maps to messages. */
export type ConfirmErrorCode = "INVALID_TOKEN" | "WRONG_PASSWORD" | "LOCKED" | "ACCOUNT_EXISTS" | "FREEMAIL_NOT_ALLOWED" | "BETA_CLOSED";

const fail = (status: "BAD_REQUEST" | "UNAUTHORIZED" | "FORBIDDEN" | "CONFLICT", code: ConfirmErrorCode) =>
  new APIError(status, { code, message: code });

/**
 * Completes a registration (ADR 005): the link token plus the password chosen at registration.
 * Server-only – never on the HTTP router; the confirm page's server action calls it through
 * `auth.api`, so the user is created by Better Auth's internal adapter (database hooks: company
 * address, name) and the session cookie is set by Better Auth itself (nextCookies).
 */
export const registrationPlugin = () =>
  ({
    id: "registration",
    endpoints: {
      confirmRegistration: createAuthEndpoint.serverOnly(
        {
          method: "POST",
          body: z.object({ token: z.string().min(1).max(200), password: z.string().min(1).max(MAX_PASSWORD) }),
        },
        async (ctx) => {
          // Counted before the check, so parallel guesses cannot exceed the limit.
          const row = await claimConfirmAttempt(hashToken(ctx.body.token));
          if (!row) throw fail("BAD_REQUEST", "INVALID_TOKEN");

          // The password proves it is the person who registered, not just someone who can read the
          // mailbox's links – and stops "pre-registering" someone else's address (account takeover).
          const valid = await ctx.context.password.verify({ hash: row.passwordHash, password: ctx.body.password });
          if (!valid) {
            if (row.failedAttempts >= MAX_REGISTRATION_ATTEMPTS) {
              await deleteLockedRegistration(row.id);
              throw fail("UNAUTHORIZED", "LOCKED");
            }
            throw fail("UNAUTHORIZED", "WRONG_PASSWORD");
          }

          // Single use: of two parallel confirmations only one gets the row.
          const pending = await consumePendingRegistration(row.id);
          if (!pending) throw fail("BAD_REQUEST", "INVALID_TOKEN");
          if (await ctx.context.internalAdapter.findUserByEmail(pending.email)) throw fail("CONFLICT", "ACCOUNT_EXISTS");
          // Checked at registration; again here, the beta may have closed in the meantime.
          if (!isCompanyEmail(pending.email) && !isExemptEmail(pending.email)) throw fail("FORBIDDEN", "FREEMAIL_NOT_ALLOWED");
          if (!(await mayEnterBeta(pending.email))) throw fail("FORBIDDEN", "BETA_CLOSED");

          // The inbox is verified by the link. The only path that creates users (validateUserInfo
          // in src/lib/auth.ts); the database hooks check company address and name once more.
          const user = await ctx.context.internalAdapter.createUser(
            { email: pending.email, name: pending.name, emailVerified: true },
            { method: REGISTRATION_METHOD },
          );
          if (!user) throw fail("FORBIDDEN", "FREEMAIL_NOT_ALLOWED");
          try {
            await ctx.context.internalAdapter.linkAccount({
              userId: user.id,
              providerId: "credential",
              accountId: user.id,
              password: pending.passwordHash,
            });
          } catch (e) {
            // No half-made account without a password: undo and let the person register again.
            await ctx.context.internalAdapter.deleteUser(user.id);
            throw e;
          }

          const session = await ctx.context.internalAdapter.createSession(user.id);
          if (!session) throw new APIError("INTERNAL_SERVER_ERROR", { code: "FAILED_TO_CREATE_SESSION", message: "FAILED_TO_CREATE_SESSION" });
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ next: safeNext(pending.next ?? undefined) });
        },
      ),
    },
  }) satisfies BetterAuthPlugin;
