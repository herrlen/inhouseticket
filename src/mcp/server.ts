import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDashboard, loadLevel } from "@/db/queries/dashboard";
import { getExplorer } from "@/db/queries/explorer";
import { createComment, createSubtask, listSubtasks, PartError, updateSubtask } from "@/db/queries/ticket-parts";
import { createTicket, TicketError, updateTicket, type Actor } from "@/db/queries/tickets";
import { todayInBerlin } from "@/components/tickets/list-model";
import { MAX_COMMENT, MAX_DESCRIPTION, MAX_SUBTASKS, MAX_TITLE } from "@/lib/limits";
import { findProject, findTicketByKey, listMembersForTool, parsePriority, resolveMember, resolveStatus, searchForTool, ticketDetail, ToolInputError } from "./data";

// inhouseticket MCP server (KONZEPT §4). Stateless: one server per request, bound to the token's
// user and workspace. Every write goes through the same data layer as the web app (limits,
// workspace scope, activity log with via = "mcp" → "via Claude" in the UI).

type Result = { content: Array<{ type: "text"; text: string }>; structuredContent?: Record<string, unknown>; isError?: boolean };

const ok = (text: string, data: Record<string, unknown>): Result => ({ content: [{ type: "text", text }], structuredContent: data });

async function run(fn: () => Promise<Result>): Promise<Result> {
  try {
    return await fn();
  } catch (e) {
    const message =
      e instanceof ToolInputError ? e.message
      : e instanceof TicketError ? ({ not_found: "Nicht gefunden.", invalid_status: "Ungültiger Status.", invalid_assignee: "Diese Person ist kein aktives Mitglied.", invalid_label: "Ungültiges Label.", project_archived: "Das Projekt ist archiviert." } as const)[e.code]
      : e instanceof PartError ? ({ not_found: "Nicht gefunden.", max_subtasks: `Höchstens ${MAX_SUBTASKS} Unteraufgaben pro Ticket.`, max_attachments: "Zu viele Anhänge.", too_large: "Zu groß.", invalid_image: "Kein gültiges Bild.", forbidden: "Keine Berechtigung." } as const)[e.code]
      : null;
    if (message) return { content: [{ type: "text", text: `Fehler: ${message}` }], isError: true };
    console.error("mcp: tool failed", e instanceof Error ? e.message : e);
    return { content: [{ type: "text", text: "Fehler: Interner Fehler. Bitte später erneut versuchen." }], isError: true };
  }
}

const priorityInput = z
  .union([z.enum(["keine", "niedrig", "mittel", "hoch", "dringend", "none", "low", "medium", "high", "urgent"]), z.number().int().min(0).max(4)])
  .describe('Priorität: "dringend", "hoch", "mittel", "niedrig" oder "keine" (alternativ 4–0)');
const dateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Datum im Format YYYY-MM-DD");
const keyInput = z.string().min(3).max(25).describe('Ticket-Key, z. B. "MKT-12"');

function ticketLine(t: { key: string; title: string; status: string; priority: string; assignee: string | null; due_date: string | null }) {
  return `- **${t.key}** ${t.title} — ${t.status}, ${t.priority}${t.assignee ? `, ${t.assignee}` : ""}${t.due_date ? `, fällig ${t.due_date}` : ""}`;
}

export function createMcpServer(actor: Actor & { via: "mcp" }) {
  const server = new McpServer({ name: "inhouseticket-mcp-server", version: "1.0.0" });
  const ws = actor.workspaceId;

  server.registerTool(
    "inhouseticket_list_projects",
    {
      title: "Projekte auflisten",
      description: "Listet alle aktiven Projekte des Workspaces mit Kürzel (für Ticket-Keys) und Anzahl offener Tickets.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () =>
      run(async () => {
        const { projects } = await getExplorer(ws, actor.userId);
        const list = projects.map((p) => ({ key: p.key, name: p.name, open_tickets: p.openCount }));
        const text = list.length ? list.map((p) => `- **${p.key}** ${p.name} (${p.open_tickets} offen)`).join("\n") : "Keine Projekte.";
        return ok(text, { projects: list });
      }),
  );

  server.registerTool(
    "inhouseticket_search_tickets",
    {
      title: "Tickets suchen",
      description:
        "Sucht Tickets im Workspace. Alle Filter optional und kombinierbar. Ohne include_done werden erledigte Tickets ausgelassen. Sortiert nach Fälligkeit, dann Priorität. Paginierung über limit/offset.",
      inputSchema: {
        query: z.string().max(200).optional().describe("Text in Titel oder Beschreibung"),
        project_key: z.string().max(10).optional().describe('Projektkürzel, z. B. "MKT"'),
        status: z.string().max(50).optional().describe('Statusname, z. B. "In Arbeit"'),
        priority: priorityInput.optional(),
        assignee: z.string().max(200).optional().describe('"me", E-Mail oder Name; "none" für nicht zugewiesen'),
        due_before: dateInput.optional().describe("Nur Tickets, die spätestens an diesem Datum fällig sind (YYYY-MM-DD)"),
        include_done: z.boolean().optional().describe("Auch erledigte Tickets einbeziehen"),
        limit: z.number().int().min(1).max(50).default(20),
        offset: z.number().int().min(0).default(0),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) =>
      run(async () => {
        const projectId = args.project_key ? (await findProject(ws, args.project_key)).id : undefined;
        const assigneeId = args.assignee === undefined ? undefined : args.assignee.toLowerCase() === "none" ? null : await resolveMember(ws, args.assignee, actor.userId);
        const res = await searchForTool(ws, {
          query: args.query,
          projectId,
          statusName: args.status,
          priority: args.priority === undefined ? undefined : parsePriority(args.priority),
          assigneeId,
          dueBefore: args.due_before,
          includeDone: args.include_done,
          limit: args.limit,
          offset: args.offset,
        });
        const hasMore = args.offset + res.tickets.length < res.total;
        const text = res.tickets.length
          ? `${res.total} Treffer${hasMore ? ` (zeige ${args.offset + 1}–${args.offset + res.tickets.length}, weitere mit offset=${args.offset + res.tickets.length})` : ""}:\n${res.tickets.map(ticketLine).join("\n")}`
          : "Keine Tickets gefunden.";
        return ok(text, { total: res.total, count: res.tickets.length, offset: args.offset, has_more: hasMore, next_offset: hasMore ? args.offset + res.tickets.length : null, tickets: res.tickets });
      }),
  );

  server.registerTool(
    "inhouseticket_get_ticket",
    {
      title: "Ticket lesen",
      description: "Liefert ein Ticket mit Beschreibung, Status, Priorität, Person, Fälligkeit, Labels, Unteraufgaben und den letzten 20 Kommentaren.",
      inputSchema: { key: keyInput },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) =>
      run(async () => {
        const { id } = await findTicketByKey(ws, args.key);
        const t = await ticketDetail(ws, id);
        const lines = [
          `# ${t.key}: ${t.title}`,
          `Projekt: ${t.project} · Status: ${t.status} · Priorität: ${t.priority} · Person: ${t.assignee ?? "nicht zugewiesen"} · Fällig: ${t.due_date ?? "–"}`,
          t.labels.length ? `Labels: ${t.labels.join(", ")}` : "",
          "",
          t.description ? t.description : "_Keine Beschreibung._",
          t.subtasks.length ? `\n## Unteraufgaben\n${t.subtasks.map((s) => `${s.index}. [${s.done ? "x" : " "}] ${s.title}`).join("\n")}` : "",
          t.comments.length ? `\n## Kommentare\n${t.comments.map((c) => `- ${c.author} (${c.created_at.slice(0, 10)}): ${c.body}`).join("\n")}` : "",
        ].filter((l) => l !== "");
        return ok(lines.join("\n"), t);
      }),
  );

  server.registerTool(
    "inhouseticket_create_ticket",
    {
      title: "Ticket anlegen",
      description: `Legt ein Ticket in einem Projekt an, optional mit Beschreibung, Status, Priorität, Person, Fälligkeit und bis zu ${MAX_SUBTASKS} Unteraufgaben. Gibt den neuen Key zurück.`,
      inputSchema: {
        project_key: z.string().max(10).describe('Projektkürzel, z. B. "MKT"'),
        title: z.string().min(1).max(MAX_TITLE),
        description: z.string().max(MAX_DESCRIPTION).optional().describe("Leichtes Markdown erlaubt"),
        status: z.string().max(50).optional().describe("Statusname; ohne Angabe der erste offene Status"),
        priority: priorityInput.optional(),
        assignee: z.string().max(200).optional().describe('"me", E-Mail oder Name eines Mitglieds'),
        due_date: dateInput.optional(),
        subtasks: z.array(z.string().min(1).max(MAX_TITLE)).max(MAX_SUBTASKS).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (args) =>
      run(async () => {
        const p = await findProject(ws, args.project_key);
        const statusId = args.status ? (await resolveStatus(ws, p.id, args.status)).id : undefined;
        const assigneeId = args.assignee ? await resolveMember(ws, args.assignee, actor.userId) : undefined;
        const created = await createTicket(actor, {
          projectId: p.id,
          title: args.title.trim(),
          statusId,
          priority: args.priority === undefined ? undefined : parsePriority(args.priority),
          assigneeId,
          dueDate: args.due_date,
        });
        if (args.description?.trim()) await updateTicket(actor, created.id, { description: args.description });
        for (const s of args.subtasks ?? []) await createSubtask(actor, created.id, s.trim());
        const key = `${p.key}-${created.number}`;
        return ok(`Ticket **${key}** angelegt: ${args.title}`, { key, project_key: p.key });
      }),
  );

  server.registerTool(
    "inhouseticket_update_ticket",
    {
      title: "Ticket ändern",
      description: "Ändert Titel, Beschreibung, Status, Priorität, Person oder Fälligkeit eines Tickets. Nur angegebene Felder ändern sich. assignee = null bzw. due_date = null entfernt den Wert.",
      inputSchema: {
        key: keyInput,
        title: z.string().min(1).max(MAX_TITLE).optional(),
        description: z.string().max(MAX_DESCRIPTION).optional(),
        status: z.string().max(50).optional(),
        priority: priorityInput.optional(),
        assignee: z.string().max(200).nullable().optional(),
        due_date: dateInput.nullable().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (args) =>
      run(async () => {
        const t = await findTicketByKey(ws, args.key);
        const patch: Parameters<typeof updateTicket>[2] = {};
        if (args.title !== undefined) patch.title = args.title.trim();
        if (args.description !== undefined) patch.description = args.description.trim() === "" ? null : args.description;
        if (args.status !== undefined) patch.statusId = (await resolveStatus(ws, t.projectId, args.status)).id;
        if (args.priority !== undefined) patch.priority = parsePriority(args.priority);
        if (args.assignee !== undefined) patch.assigneeId = args.assignee === null ? null : await resolveMember(ws, args.assignee, actor.userId);
        if (args.due_date !== undefined) patch.dueDate = args.due_date;
        if (Object.keys(patch).length === 0) throw new ToolInputError("Keine Änderung angegeben.");
        await updateTicket(actor, t.id, patch);
        const d = await ticketDetail(ws, t.id);
        return ok(`**${d.key}** aktualisiert — ${d.status}, ${d.priority}${d.assignee ? `, ${d.assignee}` : ""}${d.due_date ? `, fällig ${d.due_date}` : ""}`, { key: d.key, status: d.status, priority: d.priority, assignee: d.assignee, due_date: d.due_date });
      }),
  );

  server.registerTool(
    "inhouseticket_add_comment",
    {
      title: "Kommentar schreiben",
      description: "Schreibt einen Kommentar an ein Ticket (leichtes Markdown).",
      inputSchema: { key: keyInput, body: z.string().min(1).max(MAX_COMMENT) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (args) =>
      run(async () => {
        const t = await findTicketByKey(ws, args.key);
        await createComment(actor, t.id, args.body.trim());
        return ok(`Kommentar an ${args.key.toUpperCase()} geschrieben.`, { key: args.key.toUpperCase() });
      }),
  );

  server.registerTool(
    "inhouseticket_toggle_subtask",
    {
      title: "Unteraufgabe abhaken",
      description: "Hakt eine Unteraufgabe ab oder öffnet sie wieder. Unteraufgabe per Nummer (1–5, wie in inhouseticket_get_ticket) oder Titel.",
      inputSchema: {
        key: keyInput,
        subtask: z.union([z.number().int().min(1).max(MAX_SUBTASKS), z.string().min(1).max(MAX_TITLE)]).describe("Nummer oder Titel der Unteraufgabe"),
        done: z.boolean().default(true),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (args) =>
      run(async () => {
        const t = await findTicketByKey(ws, args.key);
        const subtasks = await listSubtasks(ws, t.id);
        const target =
          typeof args.subtask === "number" ? subtasks[args.subtask - 1] : subtasks.find((s) => s.title.toLowerCase() === String(args.subtask).trim().toLowerCase());
        if (!target) throw new ToolInputError(`Unteraufgabe nicht gefunden. Vorhanden: ${subtasks.map((s, i) => `${i + 1}. ${s.title}`).join("; ") || "keine"}.`);
        await updateSubtask(actor, target.id, { done: args.done });
        return ok(`„${target.title}“ ${args.done ? "abgehakt" : "wieder geöffnet"}.`, { key: args.key.toUpperCase(), subtask: target.title, done: args.done });
      }),
  );

  server.registerTool(
    "inhouseticket_get_workload",
    {
      title: "Auslastung abfragen",
      description: "Auslastung pro Person: offene Tickets, Punkte (Dringend 4, Hoch 3, Mittel 2, Niedrig/Keine 1), überfällige Tickets und Ampel gegenüber der Überlast-Schwelle. Optional nur für ein Projekt.",
      inputSchema: { project_key: z.string().max(10).optional() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) =>
      run(async () => {
        const projectId = args.project_key ? (await findProject(ws, args.project_key)).id : undefined;
        const d = await getDashboard(ws, { projectId, today: todayInBerlin() });
        const people = d.workload.map((w) => ({ name: w.name, open: w.open, points: w.score, overdue: w.overdue, level: loadLevel(w.score, d.threshold) }));
        const label = { ok: "OK", high: "viel", over: "ÜBERLASTET" } as const;
        const text = `Überlast-Schwelle: ${d.threshold} Punkte\n${people.map((p) => `- ${p.name}: ${p.points} Punkte, ${p.open} offen, ${p.overdue} überfällig — ${label[p.level]}`).join("\n")}`;
        return ok(text, { threshold: d.threshold, people });
      }),
  );

  server.registerTool(
    "inhouseticket_list_members",
    {
      title: "Mitglieder auflisten",
      description: "Listet die aktiven Mitglieder des Workspaces (Name und E-Mail) – für Zuweisungen.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () =>
      run(async () => {
        const members = await listMembersForTool(ws);
        const list = members.map((m) => ({ name: m.name, email: m.email, is_me: m.id === actor.userId }));
        return ok(list.map((m) => `- ${m.name} <${m.email}>${m.is_me ? " (du)" : ""}`).join("\n"), { members: list });
      }),
  );

  return server;
}
