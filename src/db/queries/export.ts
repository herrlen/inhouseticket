import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import deHierarchy from "@/lib/i18n/de/hierarchy";
import { DEFAULT_TICKET_TYPE, isTicketType } from "@/lib/ticket-hierarchy";

// Full data export of one workspace (KONZEPT §5: "Datenexport CSV/JSON pro Workspace").
// Every query is scoped to the workspace id. Attachment bytes are not included (metadata only).

const PRIORITY = ["keine", "niedrig", "mittel", "hoch", "dringend"] as const;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const day = (v: unknown) => (v ? new Date(v as string).toISOString().slice(0, 10) : null);

type Row = Record<string, unknown>;

async function rows(query: ReturnType<typeof sql>): Promise<Row[]> {
  return (await db.execute<Row>(query)) as unknown as Row[];
}

export async function exportWorkspace(workspaceId: string) {
  const [ws] = await rows(sql`select name, slug, domain, created_at from workspace where id = ${workspaceId}`);
  const [members, folders, projects, statuses, labels, tickets, ticketLabels, subtasks, comments, attachments, activity, views, prefs] = await Promise.all([
    rows(sql`select u.name, u.email, m.role, m.status, m.created_at from membership m join "user" u on u.id = m.user_id
      where m.workspace_id = ${workspaceId} order by u.name`),
    rows(sql`select id, name from folder where workspace_id = ${workspaceId} order by sort collate "C"`),
    rows(sql`select id, key, name, color, icon, folder_id, ticket_seq, archived_at, created_at from project
      where workspace_id = ${workspaceId} order by sort collate "C"`),
    rows(sql`select project_id, name, category, color, wip_limit from status where workspace_id = ${workspaceId} order by sort collate "C"`),
    rows(sql`select project_id, name, color from label where workspace_id = ${workspaceId} order by name`),
    rows(sql`select t.id, t.project_id, p.key || '-' || t.number as key, t.number, t.sort, t.title, t.description, s.name as status,
        t.priority, a.email as assignee, t.due_at, c.email as created_by, t.created_at, t.updated_at, t.completed_at,
        t.type, pt.number as parent_number
      from ticket t join project p on p.id = t.project_id join status s on s.id = t.status_id
      left join "user" a on a.id = t.assignee_id left join "user" c on c.id = t.created_by
      left join ticket pt on pt.id = t.parent_id and pt.project_id = t.project_id
      where t.workspace_id = ${workspaceId} order by p.key, t.number`),
    rows(sql`select tl.ticket_id, l.name from ticket_label tl join label l on l.id = tl.label_id
      join ticket t on t.id = tl.ticket_id where t.workspace_id = ${workspaceId} order by l.name`),
    rows(sql`select ticket_id, title, done from subtask where workspace_id = ${workspaceId} order by sort collate "C"`),
    rows(sql`select c.ticket_id, u.email as author, c.body, c.created_at, c.edited_at from comment c
      left join "user" u on u.id = c.author_id where c.workspace_id = ${workspaceId} order by c.created_at`),
    // Version 2: the image bytes (at most MAX_ATTACHMENT_BYTES each) so a move to emuchat keeps them.
    rows(sql`select a.ticket_id, a.file_name, a.mime, a.bytes, a.width, a.height, a.created_at, u.email as uploaded_by,
        encode(a.data, 'base64') as data_base64
      from attachment a left join "user" u on u.id = a.uploaded_by where a.workspace_id = ${workspaceId} order by a.created_at`),
    rows(sql`select a.ticket_id, a.type, a.payload, a.via, u.email as actor, a.created_at from activity a
      left join "user" u on u.id = a.actor_id where a.workspace_id = ${workspaceId} and a.ticket_id is not null order by a.created_at`),
    rows(sql`select u.email as owner, p.key as project, v.name, v.filters, v.created_at from saved_view v
      join "user" u on u.id = v.user_id join project p on p.id = v.project_id
      where v.workspace_id = ${workspaceId} order by v.created_at`),
    rows(sql`select u.email, up.favorites from user_pref up join "user" u on u.id = up.user_id
      where up.workspace_id = ${workspaceId}`),
  ]);

  const byTicket = <T,>(list: Row[], map: (r: Row) => T) => {
    const out = new Map<string, T[]>();
    for (const r of list) {
      const k = r.ticket_id as string;
      out.set(k, [...(out.get(k) ?? []), map(r)]);
    }
    return out;
  };
  const labelsOf = byTicket(ticketLabels, (r) => r.name as string);
  const subtasksOf = byTicket(subtasks, (r) => ({ title: r.title, done: r.done }));
  const commentsOf = byTicket(comments, (r) => ({ author: r.author, body: r.body, created_at: iso(r.created_at), edited_at: iso(r.edited_at) }));
  const attachmentsOf = byTicket(attachments, (r) => ({ file_name: r.file_name, mime: r.mime, bytes: r.bytes, width: r.width, height: r.height, uploaded_by: r.uploaded_by, created_at: iso(r.created_at), data_base64: r.data_base64 as string }));
  const activityOf = byTicket(activity, (r) => ({ type: r.type as string, payload: (r.payload ?? {}) as Record<string, unknown>, via: r.via as string, actor: (r.actor as string | null) ?? null, created_at: iso(r.created_at) }));
  const projectKey = new Map(projects.map((p) => [p.id as string, p.key as string]));
  const withoutProjectId = (t: (typeof ticketRows)[number]) => {
    const { project_id, ...rest } = t;
    void project_id;
    return rest;
  };
  const folderName = new Map(folders.map((f) => [f.id as string, f.name as string]));

  const ticketRows = tickets.map((t) => ({
    project_id: t.project_id as string,
    key: t.key as string,
    number: t.number as number,
    /** Manual order (fractional index, compare as plain strings). */
    sort: t.sort as string,
    // Hierarchy (still version 2: readers treat a missing type as "task" and a missing
    // parentNumber as "no parent"). parentNumber is the parent's number in the same project.
    type: isTicketType(t.type) ? t.type : DEFAULT_TICKET_TYPE,
    parentNumber: (t.parent_number as number | null) ?? null,
    title: t.title as string,
    description: (t.description as string | null) ?? null,
    status: t.status as string,
    priority: PRIORITY[t.priority as number] ?? "keine",
    assignee: (t.assignee as string | null) ?? null,
    due_date: day(t.due_at),
    labels: labelsOf.get(t.id as string) ?? [],
    created_by: (t.created_by as string | null) ?? null,
    created_at: iso(t.created_at),
    updated_at: iso(t.updated_at),
    completed_at: iso(t.completed_at),
    subtasks: subtasksOf.get(t.id as string) ?? [],
    comments: commentsOf.get(t.id as string) ?? [],
    attachments: attachmentsOf.get(t.id as string) ?? [],
    activity: activityOf.get(t.id as string) ?? [],
  }));

  return {
    format: "inhouseticket-export",
    // 2: adds ticket number/sort, activity, attachment bytes, ticket_seq, saved views and favorites;
    // later, without a version bump: ticket type and parentNumber (optional for readers).
    version: 2,
    exported_at: new Date().toISOString(),
    workspace: { name: ws?.name, slug: ws?.slug, domain: ws?.domain, created_at: iso(ws?.created_at) },
    members: members.map((m) => ({ name: m.name, email: m.email, role: m.role, status: m.status, joined_at: iso(m.created_at) })),
    projects: projects.map((p) => ({
      key: p.key,
      name: p.name,
      color: p.color,
      icon: p.icon,
      folder: p.folder_id ? (folderName.get(p.folder_id as string) ?? null) : null,
      ticket_seq: p.ticket_seq as number,
      archived_at: iso(p.archived_at),
      created_at: iso(p.created_at),
      statuses: statuses.filter((s) => s.project_id === p.id).map((s) => ({ name: s.name, category: s.category, color: s.color, wip_limit: s.wip_limit })),
      labels: labels.filter((l) => l.project_id === p.id).map((l) => ({ name: l.name, color: l.color })),
      tickets: ticketRows.filter((t) => t.project_id === p.id).map(withoutProjectId),
    })),
    folders: folders.map((f) => f.name as string),
    saved_views: views.map((v) => ({ owner: v.owner as string, project: v.project as string, name: v.name as string, query: String((v.filters as { query?: unknown } | null)?.query ?? ""), created_at: iso(v.created_at) })),
    favorites: prefs
      .map((p) => ({ email: p.email as string, projects: ((p.favorites as string[] | null) ?? []).flatMap((id) => projectKey.get(id) ?? []) }))
      .filter((f) => f.projects.length > 0),
  };
}

export type WorkspaceExport = Awaited<ReturnType<typeof exportWorkspace>>;

export const TICKET_CSV_HEADER = ["Key", "Projekt", "Titel", "Status", "Priorität", "Zuständig", "Fällig", "Labels", "Unteraufgaben", "Kommentare", "Erstellt", "Geändert", "Erledigt", "Beschreibung", "Typ", "Übergeordnet"] as const;

/** One row per ticket for spreadsheets. */
export function ticketCsvRows(data: WorkspaceExport) {
  return data.projects.flatMap((p) =>
    p.tickets.map((t) => [
      t.key,
      p.name as string,
      t.title,
      t.status,
      t.priority,
      t.assignee,
      t.due_date,
      t.labels.join(", "),
      t.subtasks.length ? `${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length}` : "",
      t.comments.length,
      t.created_at?.slice(0, 10) ?? "",
      t.updated_at?.slice(0, 10) ?? "",
      t.completed_at?.slice(0, 10) ?? "",
      t.description,
      deHierarchy.types[t.type],
      t.parentNumber === null ? "" : `${String(p.key)}-${t.parentNumber}`,
    ]),
  );
}
