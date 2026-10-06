import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { workspace } from "@/db/schema";

// Platform operator view (/admin). The one deliberate exception to "every query is scoped to a
// workspace" (CLAUDE.md rule 1): it reads counts and the owner contact across workspaces – never
// ticket titles, descriptions, comments or attachments. Callers must go through requireSuperadmin().

export type AdminWorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  domain: string;
  created_at: string;
  locked_at: string | null;
  auto_join: boolean;
  owner_name: string | null;
  owner_email: string | null;
  members: number;
  pending_invites: number;
  projects: number;
  tickets: number;
  open_tickets: number;
  attachment_bytes: number;
  api_tokens: number;
  last_activity: string | null;
};

export const ADMIN_PAGE_SIZE = 50;

/** Newest first; `q` matches name, slug, domain or the owner's e-mail. */
export async function listWorkspacesForAdmin(q: string, page: number): Promise<{ total: number; rows: AdminWorkspaceRow[] }> {
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const match = q
    ? sql`where w.name ilike ${pattern} or w.slug ilike ${pattern} or w.domain ilike ${pattern} or o.email ilike ${pattern}`
    : sql``;
  const [{ total } = { total: 0 }] = await db.execute<{ total: number }>(sql`
    select count(*)::int as total from workspace w
    left join lateral (
      select u.email from membership m join "user" u on u.id = m.user_id
      where m.workspace_id = w.id and m.role = 'owner' and m.status = 'active' order by m.created_at limit 1
    ) o on true ${match}`);
  const rows = await db.execute<AdminWorkspaceRow>(sql`
    select w.id, w.name, w.slug, w.domain, w.created_at, w.locked_at, w.auto_join,
      o.name as owner_name, o.email as owner_email,
      (select count(*)::int from membership m where m.workspace_id = w.id and m.status = 'active') as members,
      (select count(*)::int from invitation i where i.workspace_id = w.id and i.accepted_at is null and i.expires_at > now()) as pending_invites,
      (select count(*)::int from project p where p.workspace_id = w.id and p.archived_at is null) as projects,
      (select count(*)::int from ticket t where t.workspace_id = w.id) as tickets,
      (select count(*)::int from ticket t join status s on s.id = t.status_id
        where t.workspace_id = w.id and s.category <> 'done') as open_tickets,
      (select coalesce(sum(a.bytes), 0)::int from attachment a where a.workspace_id = w.id) as attachment_bytes,
      (select count(*)::int from api_token k where k.workspace_id = w.id and k.revoked_at is null) as api_tokens,
      (select max(a.created_at) from activity a where a.workspace_id = w.id) as last_activity
    from workspace w
    left join lateral (
      select u.name, u.email from membership m join "user" u on u.id = m.user_id
      where m.workspace_id = w.id and m.role = 'owner' and m.status = 'active'
      order by m.created_at limit 1
    ) o on true
    ${match}
    order by w.created_at desc
    limit ${ADMIN_PAGE_SIZE} offset ${(page - 1) * ADMIN_PAGE_SIZE}`);
  return { total, rows: rows.map((r) => ({
    ...r,
    created_at: new Date(r.created_at).toISOString(),
    locked_at: r.locked_at ? new Date(r.locked_at).toISOString() : null,
    last_activity: r.last_activity ? new Date(r.last_activity).toISOString() : null,
  })) };
}

export async function platformTotals() {
  const r = await db.execute<{ users: number; workspaces: number; tickets: number; active_7d: number }>(sql`
    select (select count(*)::int from "user") as users,
      (select count(*)::int from workspace) as workspaces,
      (select count(*)::int from ticket) as tickets,
      (select count(distinct a.workspace_id)::int from activity a where a.created_at > now() - interval '7 days') as active_7d`);
  return r[0]!;
}

export async function setWorkspaceLocked(workspaceId: string, locked: boolean) {
  await db.update(workspace).set({ lockedAt: locked ? new Date() : null }).where(eq(workspace.id, workspaceId));
}

/** Deletes a workspace with everything in it. Returns false if the slug confirmation does not match. */
export { deleteWorkspace as deleteWorkspaceForAdmin } from "./workspaces";
