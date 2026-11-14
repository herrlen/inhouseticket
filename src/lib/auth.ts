import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx, isAPIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { after } from "next/server";
import { magicLink } from "better-auth/plugins/magic-link";
import { oauthProvider } from "@better-auth/oauth-provider";
import { db } from "@/db/client";
import { revokeAllConnections } from "@/db/queries/connections";
import { passwordStateByEmail, userHasPassword } from "@/db/queries/credentials";
import { deletePendingForEmail } from "@/db/queries/registrations";
import * as schema from "@/db/schema";
import { env } from "@/lib/env";
import { magicLinkConfirmUrl } from "@/lib/magic-link-url";
import { mayEnterBeta } from "@/lib/beta";
import { isCompanyEmail } from "@/lib/freemail";
import { isExemptEmail } from "@/lib/superadmin";
import { MAX_NAME, MAX_PASSWORD, MIN_PASSWORD } from "@/lib/limits";
import { setPasswordUrl } from "@/lib/password-gate";
import { hashPassword, needsRehash, verifyPassword } from "@/lib/password-hash";
import type { Messages } from "@/lib/i18n/de";
import { getTOrDefault } from "@/lib/i18n/server";
import { buttonMail, sendMail } from "@/lib/mail";
import { nameFromEmail } from "@/lib/onboarding/names";
import { sanitizeClientName } from "@/lib/oauth-client-trust";
import { noAccountRegisterUrl, takeNoAccountMail } from "@/lib/no-account-mail";
import { failedSignInEmail, shouldSendNoPasswordLink } from "@/lib/no-password-link";
import { addressKey, rateLimit } from "@/lib/rate-limit";
import { REGISTRATION_METHOD, registrationPlugin } from "@/lib/registration-plugin";
import { COOKIE_DOMAIN, SITE_URL, TRUSTED_ORIGINS } from "@/lib/site";
import { hashToken } from "@/lib/tokens";

/** The MCP endpoint is the one protected resource OAuth clients (claude.ai connectors) get tokens for. */
export const MCP_RESOURCE = new URL("/mcp", env.APP_URL).toString();
/**
 * Accepted audiences: the app address and, once the app moved to its own host, the old one on the
 * site host – connectors set up with https://inhouseticket.com/mcp keep working (src/lib/hosts.ts).
 */
export const MCP_RESOURCES: readonly string[] = [...new Set([MCP_RESOURCE, new URL("/mcp", SITE_URL).toString()])];

const MAGIC_LINK_TTL_SECONDS = 15 * 60;
/** Login mails per address – the per-IP limit alone does not stop mail bombing one inbox. */
const MAGIC_LINKS_PER_EMAIL = 5;
const MAGIC_LINK_EMAIL_WINDOW_MS = 15 * 60_000;
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
  return !rateLimit(addressKey(prefix, email), limit, PER_EMAIL_WINDOW_MS).ok;
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

/**
 * After a successful password sign-in: replace a scrypt (or weaker Argon2id) hash with today's
 * Argon2id. Runs after the response; a failure only means the next sign-in tries again.
 */
async function rehashIfNeeded(userId: string, password: string): Promise<void> {
  try {
    const ctx = await auth.$context;
    const credential = (await ctx.internalAdapter.findAccounts(userId)).find((a) => a.providerId === "credential");
    if (!credential?.password || !needsRehash(credential.password)) return;
    await ctx.internalAdapter.updatePassword(userId, await hashPassword(password));
  } catch (e) {
    console.error("auth: password rehash failed", e instanceof Error ? e.name : "unknown");
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

/**
 * Mail behind a sign-in link request: the link for an existing account (a different text if it has
 * no password yet), a hint to register for an unknown address (once per address and window).
 */
async function deliverSignInMail(email: string, verifyUrl: string, t: Messages): Promise<void> {
  try {
    const state = await passwordStateByEmail(email);
    if (state === "noAccount") {
      if (!takeNoAccountMail(email)) return;
      const url = noAccountRegisterUrl(env.APP_URL, email, verifyUrl);
      const m = t.auth.noAccountMail;
      await sendMail({
        to: email,
        subject: m.subject,
        text: `${m.intro}\n\n${url}\n\n${m.outro}`,
        html: buttonMail({ heading: m.heading, intro: m.intro, button: m.button, url, outro: m.outro, lang: t.common.langTag, fallback: t.common.mailFallback }),
      });
      return;
    }
    // Mail scanners and link previews fetch links ahead of the person; a GET on the verify
    // endpoint consumes the token. So the mail points at a confirm page whose button does it.
    // The link carries the token: never log it.
    const url = magicLinkConfirmUrl(verifyUrl);
    // An account without a password learns why it gets a link and that it sets a password next.
    const m = state === "noPassword" ? t.auth.noPasswordMail : t.auth.mail;
    await sendMail({
      to: email,
      subject: m.subject,
      text: `${m.intro}\n\n${url}\n\n${m.outro}`,
      html: buttonMail({ heading: m.heading, intro: m.intro, button: m.button, url, outro: m.outro, lang: t.common.langTag, fallback: t.common.mailFallback }),
    });
  } catch (e) {
    // Never log the address or the link.
    console.error("auth: sign-in mail not sent", e instanceof Error ? e.name : "unknown");
  }
}

export const auth = betterAuth({
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: TRUSTED_ORIGINS,
  // Session cookies for inhouseticket.com and app.inhouseticket.com alike (Domain=inhouseticket.com),
  // so the landing page sees a signed-in visitor. Still Secure (https), HttpOnly and SameSite=Lax.
  // Without SITE_URL (local, E2E) they stay host-only.
  advanced: COOKIE_DOMAIN ? { crossSubDomainCookies: { enabled: true, domain: COOKIE_DOMAIN } } : undefined,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  // Per-IP limits in production only; local and E2E runs share one IP.
  rateLimit: { enabled: env.NODE_ENV === "production", window: 60, max: 100 },
  // Every account has a password (Len, 2026-10-16). Better Auth's own sign-up stays off: it would
  // create the account before the inbox is verified. Accounts come only from the registration
  // plugin below (company address, closed beta, verified inbox, ADR 005) – not from the magic link.
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: MIN_PASSWORD,
    maxPasswordLength: MAX_PASSWORD,
    resetPasswordTokenExpiresIn: RESET_LINK_TTL_SECONDS,
    revokeSessionsOnPasswordReset: true,
    // Argon2id instead of Better Auth's scrypt default; old scrypt hashes still verify and are
    // replaced at the next password sign-in (after hook below).
    password: { hash: hashPassword, verify: verifyPassword },
    // A reset means "I lost control of this account": API tokens and connector access end too.
    onPasswordReset: async ({ user }) => {
      await revokeAllConnections(user.id);
    },
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
  user: {
    // One way into an account: the confirmed registration (ADR 005). Every other creation – the
    // magic link (also off there), Better Auth's own sign-up, a future plugin – is refused here,
    // before the database hooks run.
    validateUserInfo: ({ source }) =>
      source.action === "create-user" && source.method !== REGISTRATION_METHOD ? { error: "SIGN_UP_DISABLED" } : undefined,
  },
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
      if (ctx.path === "/oauth2/register") {
        // Open registration: the name is self-chosen. No control/bidi characters and a length
        // cap, so it cannot crowd the redirect host off the consent page (ADR 004).
        const body: unknown = ctx.body;
        if (body && typeof body === "object" && "client_name" in body) {
          return { context: { body: { ...body, client_name: sanitizeClientName(body.client_name) } } };
        }
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
        !rateLimit(addressKey("magic-link", email), MAGIC_LINKS_PER_EMAIL, MAGIC_LINK_EMAIL_WINDOW_MS).ok
      ) {
        throw new APIError("TOO_MANY_REQUESTS", { code: "TOO_MANY_LINKS", message: t.login.tooMany });
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/email") return;
      const signedIn = ctx.context.newSession?.user.id;
      const password: unknown = ctx.body?.password;
      if (signedIn && typeof password === "string") {
        // The only moment the plain password is at hand: lift a legacy hash to Argon2id.
        afterResponse(() => rehashIfNeeded(signedIn, password));
        return;
      }
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
        // An account exists now: an open registration for the address can never be completed any
        // more – drop it (ADR 005).
        after: async (user) => {
          await deletePendingForEmail(user.email);
        },
      },
    },
  },
  plugins: [
    magicLink({
      expiresIn: MAGIC_LINK_TTL_SECONDS,
      storeToken: "hashed",
      rateLimit: { window: 60, max: 5 },
      // The link only signs in existing accounts (Len, 2026-10-19). Accounts come from the
      // registration alone (ADR 005); an unknown address gets a hint to register instead.
      disableSignUp: true,
      sendMagicLink: async ({ email, url: verifyUrl }) => {
        // In the language the person chose on the sign-in page – resolved while the request lives.
        const t = await getTOrDefault();
        // The lookup and the mail run after the response: neither content nor timing of the
        // answer tells an address with an account from one without.
        afterResponse(() => deliverSignInMail(email, verifyUrl, t));
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
      resources: [...MCP_RESOURCES],
      clientRegistrationDefaultResources: [MCP_RESOURCE],
      storeTokens: { hash: (token) => hashToken(token) },
    }),
    // Registration with name, address and password, completed on the confirm page (ADR 005).
    registrationPlugin(),
    nextCookies(), // must be last
  ],
});

export type Session = typeof auth.$Infer.Session;
