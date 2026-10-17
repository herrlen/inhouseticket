import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { todayInBerlin } from "@/components/tickets/list-model";
import { cappedReferrer } from "@/lib/pageview-path";

// Buffers page views in memory and writes them once a minute (one container; at most a minute
// of counts is lost on restart). Keeps the database off the request path.

const FLUSH_MS = 60_000;
const MAX_KEYS = 5_000;
const buffer = new Map<string, number>();
let timer: ReturnType<typeof setInterval> | undefined;
/** Referrer hosts of the current day (per process; after a restart the cap starts again). */
let referrers = { day: "", seen: new Set<string>() };

export function recordPageView(path: string, referrerHost: string) {
  const day = todayInBerlin();
  if (referrers.day !== day) referrers = { day, seen: new Set() };
  const referrer = cappedReferrer(referrerHost, referrers.seen);
  const key = `${day}\u0000${path}\u0000${referrer}`;
  if (!buffer.has(key) && buffer.size >= MAX_KEYS) return; // flood guard (random referrers)
  buffer.set(key, (buffer.get(key) ?? 0) + 1);
  if (!timer) {
    timer = setInterval(() => void flushPageViews(), FLUSH_MS);
    timer.unref?.();
  }
}

export async function flushPageViews() {
  if (buffer.size === 0) return;
  const entries = [...buffer.entries()];
  buffer.clear();
  try {
    const values = sql.join(
      entries.map(([key, n]) => {
        const [day, path, referrer] = key.split("\u0000") as [string, string, string];
        return sql`(${day}, ${path}, ${referrer}, ${n})`;
      }),
      sql`, `,
    );
    await db.execute(sql`insert into page_view_daily (day, path, referrer, count) values ${values}
      on conflict (day, path, referrer) do update set count = page_view_daily.count + excluded.count`);
  } catch (e) {
    console.error("pageviews: flush failed", e instanceof Error ? e.message : e);
  }
}

export async function pageViewStats(days = 30) {
  const since = sql`(${todayInBerlin()}::date - ${days - 1}::int)::text`;
  const [perDay, perPath, perReferrer] = await Promise.all([
    db.execute<{ day: string; views: number }>(sql`select day, sum(count)::int as views from page_view_daily where day >= ${since} group by day order by day desc`),
    db.execute<{ path: string; views: number }>(sql`select path, sum(count)::int as views from page_view_daily where day >= ${since} group by path order by views desc limit 15`),
    db.execute<{ referrer: string; views: number }>(sql`select referrer, sum(count)::int as views from page_view_daily where day >= ${since} and referrer <> '' group by referrer order by views desc limit 15`),
  ]);
  return { perDay: [...perDay], perPath: [...perPath], perReferrer: [...perReferrer] };
}
