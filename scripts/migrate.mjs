// Applies pending Drizzle migrations at container start (before the server boots).
// Runs as part of the image entrypoint; exits non-zero on failure so the container restarts.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("migrate: DATABASE_URL is not set");
  process.exit(1);
}

const client = postgres(url, { max: 1, onnotice: () => {} });
// Postgres may still be starting (mittwald has no depends_on) – retry for up to ~60 s.
for (let attempt = 1; ; attempt++) {
  try {
    await client`select 1`;
    break;
  } catch (e) {
    if (attempt >= 30) throw e;
    await new Promise((r) => setTimeout(r, 2000));
  }
}
await migrate(drizzle(client), { migrationsFolder: new URL("./drizzle", import.meta.url).pathname });
await client.end();
console.log("migrate: up to date");
