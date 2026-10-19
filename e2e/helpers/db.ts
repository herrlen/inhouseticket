import { existsSync } from "node:fs";
import postgres from "postgres";

// Direct database access for the few states the app can no longer produce by itself (accounts
// without a password from before registration existed) and for "nothing was created" checks.
// Same database as the dev server: DATABASE_URL from the environment (CI) or from .env (local).
if (!process.env.DATABASE_URL && existsSync(".env")) process.loadEnvFile(".env");

let client: ReturnType<typeof postgres> | null = null;
const sql = () => (client ??= postgres(process.env.DATABASE_URL ?? "", { max: 2 }));

/** Number of accounts with this address (0 or 1). */
export async function userCount(email: string): Promise<number> {
  const [row] = await sql()`select count(*)::int as n from "user" where email = ${email.toLowerCase()}`;
  return (row?.n as number | undefined) ?? 0;
}

/** Drops the password of an account – what an account from the magic-link era looks like. */
export async function removePassword(email: string): Promise<void> {
  await sql()`delete from account where provider_id = 'credential' and user_id = (select id from "user" where email = ${email.toLowerCase()})`;
}
