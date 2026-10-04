import "server-only";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url(),
  APP_URL: z.url(),
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
  /** Platform operators (comma-separated e-mails): /admin access, may sign in with a freemail address. */
  SUPERADMIN_EMAILS: z
    .string()
    .optional()
    .transform((v) => (v ?? "").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean)),
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

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
      BETTER_AUTH_SECRET: "build-phase-placeholder-not-used-at-runtime",
      SMTP_HOST: "localhost",
      SMTP_PORT: 25,
      MAIL_FROM: "build@localhost",
      BETA_ALLOWED_DOMAINS: [],
      SUPERADMIN_EMAILS: [],
    } satisfies Env);
