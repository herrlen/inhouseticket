import "server-only";
import { z } from "zod";
import { applyInstance } from "@/lib/instance";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url(),
  /** Address of the app (sign-in, workspaces, API, MCP), e.g. https://app.inhouseticket.com. */
  APP_URL: z.url(),
  /** Marketing address (landing, legal pages), e.g. https://inhouseticket.com. Optional: without it everything runs on APP_URL. */
  SITE_URL: z
    .union([z.literal(""), z.url()])
    .optional()
    .transform((v) => v?.replace(/\/+$/, "") || undefined),
  BETTER_AUTH_SECRET: z.string().min(32),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().min(1),
  MAIL_REPLY_TO: z.email().optional(),
  /** Closed beta: comma-separated company domains allowed to sign up. Empty = open. */
  BETA_ALLOWED_DOMAINS: z
    .string()
    .optional()
    .transform((v) => (v ?? "").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean)),
  /** Launch switch: "true" lets search engines index the public pages (robots, sitemap). Default off. */
  SITE_INDEXABLE: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  /** Platform operators (comma-separated e-mails): /admin access, may sign in with a freemail address. */
  SUPERADMIN_EMAILS: z
    .string()
    .optional()
    .transform((v) => (v ?? "").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean)),
  /** Individual testers (comma-separated e-mails): may sign in despite freemail block and closed beta. No admin rights. */
  TESTER_EMAILS: z
    .string()
    .optional()
    .transform((v) => (v ?? "").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean)),
  /** Self-hosted Matomo behind /stat (src/lib/matomo.ts). All three needed, otherwise off. */
  MATOMO_URL: z
    .union([z.literal(""), z.url()])
    .optional()
    .transform((v) => v?.replace(/\/+$/, "") || undefined),
  MATOMO_SITE_ID: z
    .union([z.literal(""), z.string().regex(/^\d+$/)])
    .optional()
    .transform((v) => v || undefined),
  MATOMO_TOKEN: z
    .string()
    .optional()
    .transform((v) => v?.trim() || undefined),
  /**
   * Key material for integration credentials (ClickUp tokens, src/lib/integrations/crypto.ts).
   * Without it the integrations page explains that the feature is not set up. Changing it makes
   * stored tokens unreadable – the integration then asks for a new token.
   */
  INTEGRATION_SECRET: z
    .string()
    .optional()
    .transform((v) => v?.trim() || undefined)
    .pipe(z.string().min(32).optional()),
  /**
   * Company instance on its own server (selfhost/, docs/selbst-hosten.md): "true" turns off the
   * landing page, search engines and our legal texts (src/lib/instance.ts).
   */
  SELF_HOSTED: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  /** Company instance: name of the operating company for the legal note, e.g. "Firma GmbH". */
  INSTANCE_NAME: z
    .string()
    .optional()
    .transform((v) => v?.trim().slice(0, 100) || undefined),
  /** Company instance: the company's own legal notice and privacy policy (links instead of our pages). */
  IMPRINT_URL: z
    .union([z.literal(""), z.url({ protocol: /^https?$/ })])
    .optional()
    .transform((v) => v || undefined),
  PRIVACY_URL: z
    .union([z.literal(""), z.url({ protocol: /^https?$/ })])
    .optional()
    .transform((v) => v || undefined),
  /** Test-only override of the ClickUp API base (mock server in E2E). Ignored in production. */
  CLICKUP_API_URL: z
    .union([z.literal(""), z.url()])
    .optional()
    .transform((v) => v?.replace(/\/+$/, "") || undefined),
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.transform(applyInstance).safeParse(process.env);

// `next build` loads route modules to collect config; secrets only exist at runtime (container
// env). During the build phase we tolerate missing values – nothing connects at import time.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

if (!parsed.success && !isBuildPhase) {
  // Fail fast at startup with readable field errors (values are never logged).
  throw new Error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
}

export const env: Env = parsed.success
  ? parsed.data
  : ({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://build:build@localhost:5432/build",
      APP_URL: "http://localhost:3000",
      SITE_URL: undefined,
      BETTER_AUTH_SECRET: "build-phase-placeholder-not-used-at-runtime",
      SMTP_HOST: "localhost",
      SMTP_PORT: 25,
      MAIL_FROM: "build@localhost",
      BETA_ALLOWED_DOMAINS: [],
      SUPERADMIN_EMAILS: [],
      TESTER_EMAILS: [],
      SITE_INDEXABLE: false,
      MATOMO_URL: undefined,
      MATOMO_SITE_ID: undefined,
      MATOMO_TOKEN: undefined,
      INTEGRATION_SECRET: undefined,
      CLICKUP_API_URL: undefined,
      SELF_HOSTED: false,
      INSTANCE_NAME: undefined,
      IMPRINT_URL: undefined,
      PRIVACY_URL: undefined,
    } satisfies Env);
