import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { project, status, ticket } from "@/db/schema";

export type SearchHit = {
  id: string;
  key: string;
  title: string;
  projectKey: string;
  projectName: string;
  projectColor: string;
  statusName: string;
  done: boolean;
};

const KEY = /^([A-Za-z][A-Za-z0-9]{1,9})-(\d{1,9})$/;

/** Words → prefix tsquery ("bann kampa" → 'bann':* & 'kampa':*). Only letters/digits survive. */
export function toPrefixQuery(q: string): string | null {
  const words = q
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0)
    .slice(0, 8);
  return words.length ? words.map((w) => `${w}:*`).join(" & ") : null;
}

export async function searchTickets(workspaceId: string, q: string, limit = 20): Promise<SearchHit[]> {
  const query = q.trim().slice(0, 200);
  if (!query) return [];
  const base = db
    .select({
      id: ticket.id,
      number: ticket.number,
      title: ticket.title,
      projectKey: project.key,
      projectName: project.name,
      projectColor: project.color,
      statusName: status.name,
      category: status.category,
    })
    .from(ticket)
    .innerJoin(project, eq(project.id, ticket.projectId))
    .innerJoin(status, eq(status.id, ticket.statusId))
    .$dynamic();
  const scope = and(eq(ticket.workspaceId, workspaceId), isNull(project.archivedAt));

  const key = query.match(KEY);
  let rows;
  if (key) {
    rows = await base.where(and(scope, eq(project.key, key[1]!.toUpperCase()), eq(ticket.number, Number(key[2])))).limit(1);
  } else {
    const ts = toPrefixQuery(query);
    if (!ts) return [];
    // 'simple' prefix query matches word starts regardless of German stemming; the stored
    // vector is 'german', so also try the stemmed websearch query and take the better rank.
    const match = sql`(${ticket.search} @@ to_tsquery('simple', ${ts}) or ${ticket.search} @@ websearch_to_tsquery('german', ${query}))`;
    rows = await base
      .where(and(scope, match))
      .orderBy(
        desc(sql`greatest(ts_rank(${ticket.search}, to_tsquery('simple', ${ts})), ts_rank(${ticket.search}, websearch_to_tsquery('german', ${query})))`),
        desc(ticket.updatedAt),
      )
      .limit(limit);
  }
  return rows.map((r) => ({
    id: r.id,
    key: `${r.projectKey}-${r.number}`,
    title: r.title,
    projectKey: r.projectKey,
    projectName: r.projectName,
    projectColor: r.projectColor,
    statusName: r.statusName,
    done: r.category === "done",
  }));
}
