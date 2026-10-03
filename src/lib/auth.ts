import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins/magic-link";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { env } from "@/lib/env";
import { isCompanyEmail } from "@/lib/freemail";
import { de } from "@/lib/i18n/de";
import { buttonMail, sendMail } from "@/lib/mail";
import { nameFromEmail } from "@/lib/names";

const MAGIC_LINK_TTL_SECONDS = 15 * 60;

export const auth = betterAuth({
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  rateLimit: { enabled: true, window: 60, max: 100 },
  hooks: {
    // Friendly, early rejection before a mail is sent (CLAUDE.md rule 3).
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/magic-link") return;
      const email: unknown = ctx.body?.email;
      if (typeof email !== "string" || !isCompanyEmail(email)) {
        throw new APIError("BAD_REQUEST", { code: "FREEMAIL_NOT_ALLOWED", message: de.auth.freemail });
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        // Hard guard for every sign-up path.
        before: async (user) => {
          if (!isCompanyEmail(user.email)) return false;
          return { data: { ...user, email: user.email.toLowerCase(), name: user.name || nameFromEmail(user.email) } };
        },
      },
    },
  },
  plugins: [
    magicLink({
      expiresIn: MAGIC_LINK_TTL_SECONDS,
      storeToken: "hashed",
      rateLimit: { window: 60, max: 5 },
      sendMagicLink: async ({ email, url }) => {
        await sendMail({
          to: email,
          subject: de.auth.mail.subject,
          text: `${de.auth.mail.intro}\n\n${url}\n\n${de.auth.mail.outro}`,
          html: buttonMail({
            heading: de.auth.mail.heading,
            intro: de.auth.mail.intro,
            button: de.auth.mail.button,
            url,
            outro: de.auth.mail.outro,
          }),
        });
      },
    }),
    nextCookies(), // must be last
  ],
});

export type Session = typeof auth.$Infer.Session;
