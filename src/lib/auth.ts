import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx, isAPIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { after } from "next/server";
import { magicLink } from "better-auth/plugins/magic-link";
import { oauthProvider } from "@better-auth/oauth-provider";
import { db } from "@/db/client";
import { passwordStateByEmail, userHasPassword } from "@/db/queries/credentials";
import * as schema from "@/db/schema";
import { env } from "@/lib/env";
import { magicLinkConfirmUrl } from "@/lib/magic-link-url";
import { mayEnterBeta } from "@/lib/beta";
import { isCompanyEmail } from "@/lib/freemail";
import { isExemptEmail } from "@/lib/superadmin";
import { MAX_PASSWORD, MIN_PASSWORD } from "@/lib/limits";
import { setPasswordUrl } from "@/lib/password-gate";
import { getTOrDefault } from "@/lib/i18n/server";
import { buttonMail, sendMail } from "@/lib/mail";
import { nameFromEmail } from "@/lib/names";
import { failedSignInEmail, shouldSendNoPasswordLink } from "@/lib/no-password-link";
import { rateLimit } from "@/lib/rate-limit";
import { hashToken } from "@/lib/tokens";

/** The MCP endpoint is the one protected resource OAuth clients (claude.ai connectors) get tokens for. */
export const MCP_RESOURCE = new URL("/mcp", env.APP_URL).toString();

const MAGIC_LINK_TTL_SECONDS = 15 * 60;
/** Login mails per address – the per-IP limit alone does not stop mail bombing one inbox. */
const MAGIC_LINKS_PER_EMAIL = 5;
const MAGIC_LINK_EMAIL_WINDOW_MS = 15 * 60_000;
const MAX_NAME = 100;
/** Password reset links: short-lived and single-use (the token is consumed on use). */
const RESET_LINK_TTL_SECONDS = 30 * 60;
/** Password sign-ins per address – slows guessing even from many IPs. */
const SIGN_INS_PER_EMAIL = 10;
/** Reset mails per address (forgot-password form and settings button together). */
const RESETS_PER_EMAIL = 3;
const PER_EMAIL_WINDOW_MS = 15 * 60_000;

/** Per-address limit in production (local and E2E runs reuse addresses in quick succession). */
function tooManyForEmail(prefix: string, email: unknown, limit: number): boolean {
  if (env.NODE_ENV !== "production" || typeof email !== "string") return false;
  return !rateLimit(`${prefix}:${email.trim().toLowerCase()}`, limit, PER_EMAIL_WINDOW_MS).ok;
}

/**
 * Failed password sign-in of an account without a password: mail it a sign-in link (the forced
 * set-password page follows). Runs after the response – status, body and timing of the answer
 * are the same for every address. The link goes through the magic-link endpoint itself, so its
 * hooks (company address, beta, per-address limit) and the confirm page apply unchanged.
 */
async function mailNoPasswordLink(email: string, headers: Headers | undefined): Promise<void> {
  try {
    if (!shouldSendNoPasswordLink(email, await passwordStateByEmail(email))) return;
    await auth.api.signInMagicLink({
      body: { email, callbackURL: "/start", errorCallbackURL: "/login?error=link" },
      headers: headers ?? new Headers(),
    });
  } catch (e) {
    // Never log the address (or anything carrying it).
    console.error("auth: no-password link not sent", isAPIError(e) ? e.body?.code : e instanceof Error ? e.name : "unknown");
  }
}

/** `after()` inside a request (route handler); plain fire-and-forget for direct server calls. */
function afterResponse(task: () => Promise<void>): void {
  try {
    after(task);
  } catch {
    void task();
  }
}

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
  // Every account has a password (Len, 2026-10-16). Accounts are only created by the magic link
  // (company address, closed beta, verified inbox) – a password sign-up would skip all three.
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: MIN_PASSWORD,
    maxPasswordLength: MAX_PASSWORD,
    resetPasswordTokenExpiresIn: RESET_LINK_TTL_SECONDS,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      // The link carries the token: never log it. Language of the person who asked for it.
      const t = await getTOrDefault();
      const m = t.password.mail;
      await sendMail({
        to: user.email,
        subject: m.subject,
        text: `${m.intro}\n\n${url}\n\n${m.outro}`,
        html: buttonMail({ heading: m.heading, intro: m.intro, button: m.button, url, outro: m.outro, lang: t.common.langTag, fallback: t.common.mailFallback }),
      });
    },
  },
  // Reset tokens are stored as SHA-256 only (magic-link tokens hash themselves, see below).
  verification: { storeIdentifier: { default: "plain", overrides: { "reset-password:": "hashed" } } },
  // Profile changes are not offered; the endpoint would accept any avatar URL and unbounded names.
  disabledPaths: ["/update-user"],
  hooks: {
    // Friendly, early rejection before a mail is sent (CLAUDE.md rule 3).
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-in/email") {
        if (tooManyForEmail("sign-in", ctx.body?.email, SIGN_INS_PER_EMAIL)) {
          throw new APIError("TOO_MANY_REQUESTS", { code: "TOO_MANY_ATTEMPTS", message: (await getTOrDefault()).login.tooMany });
        }
        return;
      }
      if (ctx.path === "/request-password-reset") {
        // Same answer as a sent mail: the response never reveals whether the address exists.
        if (tooManyForEmail("reset", ctx.body?.email, RESETS_PER_EMAIL)) return ctx.json({ status: true });
        return;
      }
      if (ctx.path === "/oauth2/authorize" && ctx.request) {
        // A connector login is a sign-in too: no tokens for a person without a password.
        const session = await getSessionFromCtx(ctx);
        if (session && !(await userHasPassword(session.user.id))) {
          const url = new URL(ctx.request.url);
          throw ctx.redirect(setPasswordUrl(`${url.pathname}${url.search}`));
        }
        return;
      }
      if (ctx.path !== "/sign-in/magic-link") return;
      const t = await getTOrDefault();
      const email: unknown = ctx.body?.email;
      if (typeof email !== "string" || !(isCompanyEmail(email) || isExemptEmail(email))) {
        throw new APIError("BAD_REQUEST", { code: "FREEMAIL_NOT_ALLOWED", message: t.auth.freemail });
      }
      if (!(await mayEnterBeta(email))) {
        throw new APIError("FORBIDDEN", { code: "BETA_CLOSED", message: t.auth.betaClosed });
      }
      if (
        env.NODE_ENV === "production" &&
        !rateLimit(`magic-link:${email.trim().toLowerCase()}`, MAGIC_LINKS_PER_EMAIL, MAGIC_LINK_EMAIL_WINDOW_MS).ok
      ) {
        throw new APIError("TOO_MANY_REQUESTS", { code: "TOO_MANY_LINKS", message: t.login.tooMany });
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/email") return;
      const returned = ctx.context.returned;
      const email = failedSignInEmail(isAPIError(returned) ? returned.statusCode : undefined, ctx.body?.email);
      // Not awaited: the lookup and the mail must not show up in the response time.
      if (email) afterResponse(() => mailNoPasswordLink(email, ctx.headers ?? ctx.request?.headers));
    }),
  },
  databaseHooks: {
    user: {
      create: {
        // Hard guard for every sign-up path.
        before: async (user) => {
          if (!isCompanyEmail(user.email) && !isExemptEmail(user.email)) return false;
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
      sendMagicLink: async ({ email, url: verifyUrl }) => {
        // Mail scanners and link previews fetch links ahead of the person; a GET on the verify
        // endpoint consumes the token. So the mail points at a confirm page whose button does it.
        const url = magicLinkConfirmUrl(verifyUrl);
        // In the language the person chose on the sign-in page. An account without a password
        // learns why it gets a link and that it sets a password next.
        const t = await getTOrDefault();
        const m = (await passwordStateByEmail(email)) === "noPassword" ? t.auth.noPasswordMail : t.auth.mail;
        await sendMail({
          to: email,
          subject: m.subject,
          text: `${m.intro}\n\n${url}\n\n${m.outro}`,
          html: buttonMail({
            heading: m.heading,
            intro: m.intro,
            button: m.button,
            url,
            outro: m.outro,
            lang: t.common.langTag,
            fallback: t.common.mailFallback,
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
