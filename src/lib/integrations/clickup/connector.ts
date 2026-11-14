// ClickUp connector (API v2, checked against developer.clickup.com on 14.11.2026):
//   GET /team                      → Workspaces ("teams") incl. members with e-mail
//   GET /team/{id}/space           → spaces incl. statuses
//   GET /space/{id}/folder         → folders incl. their lists
//   GET /space/{id}/list           → folderless lists
//   GET /team/{id}/task            → tasks, 100 per page, page from 0, filters space_ids[]/list_ids[],
//                                    include_closed, subtasks, date_updated_gt (Unix ms)
//   GET /task/{id}/comment         → 25 newest comments, older ones via start + start_id
// Read-only. Responses are parsed defensively: unknown or missing fields never throw.

import { mapClickUpPriority } from "../../import/clickup";
import type {
  AccountInfo,
  Connector,
  ContainerNode,
  ExternalChecklist,
  ExternalComment,
  ExternalPerson,
  ExternalStatus,
  ExternalTask,
  PullOptions,
  PullPage,
  PullScope,
} from "../types";
import { ClickUpClient, type ClientOptions } from "./client";

export const PAGE_SIZE = 100;
const COMMENT_PAGE = 25;
const MAX_COMMENT_PAGES = 40;
/** Ids per request: keeps URLs short; each chunk is its own stream of pages. */
const IDS_PER_QUERY = 20;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

/** ClickUp dates: Unix ms as string or number; null/"null"/"" → null. */
export function clickUpDate(v: unknown): Date | null {
  const s = str(v).trim();
  if (!/^\d{9,14}$/.test(s)) return null;
  const n = Number(s);
  const d = new Date(s.length <= 10 ? n * 1000 : n);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toPerson(v: unknown): ExternalPerson | null {
  const o = obj(v);
  const id = str(o.id);
  if (!id) return null;
  const email = str(o.email).trim().toLowerCase();
  return { id, name: str(o.username).trim() || email || id, email: email || null };
}

function toStatus(v: unknown): ExternalStatus {
  const o = obj(v);
  return { name: str(o.status).trim(), type: str(o.type).trim().toLowerCase(), color: str(o.color) || null };
}

function toChecklists(v: unknown): ExternalChecklist[] {
  return arr(v).map((c) => {
    const o = obj(c);
    return {
      name: str(o.name).trim(),
      items: arr(o.items)
        .map((i) => ({ name: str(obj(i).name).trim(), done: obj(i).resolved === true }))
        .filter((i) => i.name),
    };
  });
}

/** One task of GET /team/{id}/task → ExternalTask. Returns null for rows without id or name. */
export function toExternalTask(v: unknown): ExternalTask | null {
  const o = obj(v);
  const id = str(o.id);
  if (!id) return null;
  const folder = obj(o.folder);
  const list = obj(o.list);
  const priority = obj(o.priority);
  return {
    id,
    ref: str(o.custom_id) || id,
    url: /^https:\/\//.test(str(o.url)) ? str(o.url) : null,
    title: str(o.name),
    description: (str(o.markdown_description) || str(o.text_content) || "").trim(),
    status: toStatus(o.status),
    priority: priority.id === undefined && priority.priority === undefined ? 0 : mapClickUpPriority(str(priority.id) || str(priority.priority)),
    assignees: arr(o.assignees).map(toPerson).filter((p): p is ExternalPerson => p !== null),
    tags: arr(o.tags).map((t) => str(obj(t).name).trim()).filter(Boolean),
    parentId: str(o.parent) || null,
    spaceId: str(obj(o.space).id),
    listId: str(list.id) || null,
    listName: str(list.name).trim() || null,
    folderName: folder.hidden === true ? null : str(folder.name).trim() || null,
    // custom_item_id 1 is ClickUp's built-in "Milestone" task type.
    milestone: o.custom_item_id === 1 || o.custom_item_id === "1",
    checklists: toChecklists(o.checklists),
    createdAt: clickUpDate(o.date_created),
    updatedAt: clickUpDate(o.date_updated),
    doneAt: clickUpDate(o.date_done) ?? clickUpDate(o.date_closed),
    dueAt: clickUpDate(o.due_date),
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** The task queries of a scope, in a fixed order (resume position = query index + page). */
export function pullQueries(scope: PullScope): Array<{ space_ids?: string[]; list_ids?: string[] }> {
  return [
    ...chunk([...new Set(scope.spaceIds)].sort(), IDS_PER_QUERY).map((ids) => ({ space_ids: ids })),
    ...chunk([...new Set(scope.listIds)].sort(), IDS_PER_QUERY).map((ids) => ({ list_ids: ids })),
  ];
}



export class ClickUpConnector implements Connector {
  readonly id = "clickup" as const;
  readonly auth = "token" as const;
  private readonly client: ClickUpClient;

  constructor(options: ClientOptions) {
    this.client = new ClickUpClient(options);
  }

  private async teams(): Promise<Obj[]> {
    const res = await this.client.get<Obj>("/team");
    return arr(res.teams).map(obj);
  }

  async testConnection(): Promise<AccountInfo> {
    const teams = await this.teams();
    return { accounts: teams.map((t) => ({ id: str(t.id), name: str(t.name).trim() || str(t.id) })).filter((a) => a.id) };
  }

  async listPeople(accountId: string): Promise<ExternalPerson[]> {
    const team = (await this.teams()).find((t) => str(t.id) === accountId);
    return arr(team?.members)
      .map((m) => toPerson(obj(m).user))
      .filter((p): p is ExternalPerson => p !== null);
  }

  async listContainers(accountId: string, options: { shallow?: boolean } = {}): Promise<ContainerNode[]> {
    const res = await this.client.get<Obj>(`/team/${encodeURIComponent(accountId)}/space`, { archived: false });
    const spaces: ContainerNode[] = [];
    for (const s of arr(res.spaces).map(obj)) {
      const id = str(s.id);
      if (!id) continue;
      const statuses = arr(s.statuses).map(toStatus).filter((st) => st.name);
      if (options.shallow) {
        spaces.push({ id, name: str(s.name).trim() || id, kind: "space", statuses, children: [] });
        continue;
      }
      const [folders, lists] = await Promise.all([
        this.client.get<Obj>(`/space/${encodeURIComponent(id)}/folder`, { archived: false }),
        this.client.get<Obj>(`/space/${encodeURIComponent(id)}/list`, { archived: false }),
      ]);
      const listNode = (l: unknown): ContainerNode => ({ id: str(obj(l).id), name: str(obj(l).name).trim(), kind: "list", children: [] });
      spaces.push({
        id,
        name: str(s.name).trim() || id,
        kind: "space",
        statuses,
        children: [
          ...arr(folders.folders)
            .map(obj)
            .filter((f) => str(f.id))
            .map((f) => ({ id: str(f.id), name: str(f.name).trim(), kind: "folder" as const, children: arr(f.lists).map(listNode).filter((l) => l.id) })),
          ...arr(lists.lists).map(listNode).filter((l) => l.id),
        ],
      });
    }
    return spaces;
  }

  /**
   * Pages of tasks for the selected spaces and lists, closed ones and subtasks included. Ordered by
   * creation date, so pages stay stable while tasks change during a run.
   */
  async *pull(scope: PullScope, options: PullOptions = {}): AsyncIterable<PullPage> {
    const queries = pullQueries(scope);
    for (let q = options.startQuery ?? 0; q < queries.length; q++) {
      for (let page = q === (options.startQuery ?? 0) ? (options.startPage ?? 0) : 0; ; page++) {
        const res = await this.client.get<Obj>(`/team/${encodeURIComponent(scope.accountId)}/task`, {
          ...queries[q],
          page,
          order_by: "created",
          include_closed: true,
          subtasks: true,
          include_markdown_description: true,
          date_updated_gt: options.since ? options.since.getTime() : undefined,
        });
        const raw = arr(res.tasks);
        const tasks = raw.map(toExternalTask).filter((t): t is ExternalTask => t !== null);
        // `last_page` is not in the reference; a short page is the reliable end marker.
        const last = res.last_page === true || raw.length < PAGE_SIZE;
        yield { query: q, page, tasks, last: last && q === queries.length - 1 };
        if (last) break;
      }
    }
  }

  async *pullComments(taskId: string): AsyncIterable<ExternalComment> {
    let start: { date: string; id: string } | null = null;
    for (let i = 0; i < MAX_COMMENT_PAGES; i++) {
      const res: Obj = await this.client.get<Obj>(`/task/${encodeURIComponent(taskId)}/comment`, start ? { start: start.date, start_id: start.id } : {});
      const items = arr(res.comments).map(obj);
      for (const c of items) {
        const id = str(c.id);
        if (!id) continue;
        yield { id, body: str(c.comment_text).trim(), author: toPerson(c.user), createdAt: clickUpDate(c.date) };
      }
      const oldest = items.at(-1);
      if (items.length < COMMENT_PAGE || !oldest || str(oldest.id) === start?.id) return;
      start = { date: str(oldest.date), id: str(oldest.id) };
    }
  }
}
