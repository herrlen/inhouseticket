import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins/magic-link";
import { oauthProvider } from "@better-auth/oauth-provider";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { env } from "@/lib/env";
import { mayEnterBeta } from "@/lib/beta";
import { isCompanyEmail } from "@/lib/freemail";
import { isSuperadminEmail } from "@/lib/superadmin";
import { de } from "@/lib/i18n/de";
import { buttonMail, sendMail } from "@/lib/mail";
import { nameFromEmail } from "@/lib/names";
import { rateLimit } from "@/lib/rate-limit";
import { hashToken } from "@/lib/tokens";

/** The MCP endpoint is the one protected resource OAuth clients (claude.ai connectors) get tokens for. */
export const MCP_RESOURCE = new URL("/mcp", env.APP_URL).toString();

const MAGIC_LINK_TTL_SECONDS = 15 * 60;
/** Login mails per address – the per-IP limit alone does not stop mail bombing one inbox. */
const MAGIC_LINKS_PER_EMAIL = 5;
const MAGIC_LINK_EMAIL_WINDOW_MS = 15 * 60_000;
const MAX_NAME = 100;

export const auth = betterAuth({
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  // Per-IP limits in production only; local and E2E runs share one IP.
  rateLimit: { enabled: env.NODE_ENV === "production", window: 60, max: 100 },
  // Profile changes are not offered; the endpoint would accept any avatar URL and unbounded names.
  disabledPaths: ["/update-user"],
  hooks: {
    // Friendly, early rejection before a mail is sent (CLAUDE.md rule 3).
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/magic-link") return;
      const email: unknown = ctx.body?.email;
      if (typeof email !== "string" || !(isCompanyEmail(email) || isSuperadminEmail(email))) {
        throw new APIError("BAD_REQUEST", { code: "FREEMAIL_NOT_ALLOWED", message: de.auth.freemail });
      }
      if (!(await mayEnterBeta(email))) {
        throw new APIError("FORBIDDEN", { code: "BETA_CLOSED", message: de.auth.betaClosed });
      }
      if (
        env.NODE_ENV === "production" &&
        !rateLimit(`magic-link:${email.trim().toLowerCase()}`, MAGIC_LINKS_PER_EMAIL, MAGIC_LINK_EMAIL_WINDOW_MS).ok
      ) {
        throw new APIError("TOO_MANY_REQUESTS", { code: "TOO_MANY_LINKS", message: de.login.tooMany });
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        // Hard guard for every sign-up path.
        before: async (user) => {
          if (!isCompanyEmail(user.email) && !isSuperadminEmail(user.email)) return false;
          const name = (user.name || nameFromEmail(user.email)).trim().slice(0, MAX_NAME);
          return { data: { ...user, email: user.email.toLowerCase(), name } };
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
    // OAuth 2.1 for claude.ai / Claude Desktop connectors: dynamic client registration, PKCE,
    // magic-link login, consent page with workspace choice. Access tokens are opaque and stored as
    // sha256 hashes, so /mcp checks them with one lookup and revocation takes effect at once.
    oauthProvider({
      loginPage: "/login",
      consentPage: "/oauth/consent",
      disableJwtPlugin: true,
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      scopes: ["openid", "profile", "email", "offline_access"],
      resources: [MCP_RESOURCE],
      clientRegistrationDefaultResources: [MCP_RESOURCE],
      storeTokens: { hash: (token) => hashToken(token) },
    }),
    nextCookies(), // must be last
  ],
});

export type Session = typeof auth.$Infer.Session;
