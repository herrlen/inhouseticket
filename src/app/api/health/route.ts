import { sql } from "drizzle-orm";
import { db } from "@/db/client";

export const dynamic = "force-dynamic";

/** Liveness + database check for monitoring and the deploy script. No data, no auth. */
export async function GET() {
  const version = process.env.APP_VERSION ?? "dev";
  try {
    await db.execute(sql`select 1`);
    return Response.json({ status: "ok", database: "ok", version }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "error", database: "error", version }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
