import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/mail";

// Daily e-mail digest (KONZEPT §2.8): one mail per person and workspace with what happened in the
// last 24 hours, plus "due tomorrow" reminders. No per-event mail flood. Idempotent per day:
// each recipient is claimed atomically (last_digest_on = today) before the mail goes out.

const DIGEST_HOUR = 7; // Europe/Berlin

function berlin(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) % 24 };
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

type Line = { type: string; actor: string | null; key: string | null; title: string | null; payload: Record<string, unknown> };

export function describeNotification(l: Line): string {
  const who = l.actor ?? "Jemand";
  const what = l.key ? `${l.key} „${l.title ?? ""}“` : "ein Ticket";
  switch (l.type) {
    case "assigned":
      return `${who} hat dir ${what} zugewiesen`;
    case "mention":
      return `${who} hat dich in ${what} erwähnt`;
    case "status":
      return `${who} hat ${what} auf „${String(l.payload.to ?? "")}“ gesetzt`;
    case "due_tomorrow":
      return `${what} ist morgen fällig`;
    default:
      return `Neues in ${what}`;
  }
}

export async function runDailyDigest(now = new Date(), opts: { force?: boolean } = {}) {
  const { date: today, hour } = berlin(now);
  if (!opts.force && hour < DIGEST_HOUR) return { sent: 0, reminders: 0 };
  const tomorrow = new Date(`${today}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowIso = tomorrow.toISOString().slice(0, 10);

  // 1) "Due tomorrow" reminders for assignees – once per ticket and day.
  const reminders = await db.execute(sql`
    insert into notification (user_id, workspace_id, ticket_id, type, payload)
    select t.assignee_id, t.workspace_id, t.id, 'due_tomorrow', jsonb_build_object('due', ${tomorrowIso}::text)
    from ticket t
    join status s on s.id = t.status_id and s.category <> 'done'
    join project p on p.id = t.project_id and p.archived_at is null
    join membership m on m.workspace_id = t.workspace_id and m.user_id = t.assignee_id and m.status = 'active'
    where (t.due_at at time zone 'UTC')::date = ${tomorrowIso}::date
      and not exists (
        select 1 from notification n
        where n.ticket_id = t.id and n.user_id = t.assignee_id and n.type = 'due_tomorrow' and n.payload->>'due' = ${tomorrowIso}
      )
    returning id`);

  // 2) Recipients with unread news from the last 24 h who did not get today's digest yet.
  const candidates = await db.execute<{ user_id: string; workspace_id: string; email: string; name: string; ws_name: string; ws_slug: string }>(sql`
    select distinct m.user_id, m.workspace_id, u.email, u.name, w.name as ws_name, w.slug as ws_slug
    from membership m
    join "user" u on u.id = m.user_id
    join workspace w on w.id = m.workspace_id
    left join user_pref up on up.user_id = m.user_id and up.workspace_id = m.workspace_id
    where m.status = 'active'
      and coalesce(up.email_digest, true)
      and up.last_digest_on is distinct from ${today}
      and exists (
        select 1 from notification n
        where n.user_id = m.user_id and n.workspace_id = m.workspace_id and n.read_at is null
          and n.created_at > now() - interval '24 hours'
      )`);

  let sent = 0;
  for (const c of candidates) {
    // Atomic claim: only one run (or instance) sends today's digest for this person.
    const claimed = await db.execute(sql`
      insert into user_pref (user_id, workspace_id, last_digest_on) values (${c.user_id}, ${c.workspace_id}, ${today})
      on conflict (user_id, workspace_id) do update set last_digest_on = excluded.last_digest_on
        where user_pref.last_digest_on is distinct from excluded.last_digest_on
      returning user_id`);
    if (claimed.length === 0) continue;

    const lines = await db.execute<{ type: string; payload: Record<string, unknown>; actor: string | null; number: number | null; title: string | null; key: string | null }>(sql`
      select n.type, n.payload, a.name as actor, t.number, t.title, p.key
      from notification n
      left join "user" a on a.id = n.actor_id
      left join ticket t on t.id = n.ticket_id
      left join project p on p.id = t.project_id
      where n.user_id = ${c.user_id} and n.workspace_id = ${c.workspace_id} and n.read_at is null
        and n.created_at > now() - interval '24 hours'
      order by n.created_at desc
      limit 20`);
    const items = lines.map((l) => describeNotification({ type: l.type, actor: l.actor, key: l.key && l.number ? `${l.key}-${l.number}` : null, title: l.title, payload: l.payload ?? {} }));
    const url = `${env.APP_URL}/${c.ws_slug}/inbox`;
    const subject = `${items.length === 1 ? "1 Neuigkeit" : `${items.length} Neuigkeiten`} in ${c.ws_name}`;
    const text = `Hallo ${c.name},\n\n${items.map((i) => `• ${i}`).join("\n")}\n\nZur Inbox: ${url}\n\nDen täglichen Digest kannst du in der Inbox abschalten.`;
    const html = `<!doctype html><html lang="de"><body style="margin:0;padding:32px;background:#fafaf9;font-family:Inter,Arial,sans-serif;color:#1c1917">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e7e5e4;border-radius:10px;padding:32px">
<h1 style="font-size:18px;margin:0 0 16px">${escape(subject)}</h1>
<ul style="font-size:14px;line-height:1.6;margin:0 0 24px;padding-left:18px">${items.map((i) => `<li>${escape(i)}</li>`).join("")}</ul>
<a href="${escape(url)}" style="display:inline-block;background:#5b5bf7;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:6px">Zur Inbox</a>
<p style="font-size:12px;color:#78716c;margin:24px 0 0">Den täglichen Digest kannst du in der Inbox abschalten.</p>
</div></body></html>`;
    try {
      await sendMail({ to: c.email, subject, text, html });
      sent++;
    } catch (e) {
      // Logged without personal data; the claim stays – better one missed digest than duplicates.
      console.error("digest: mail failed", e instanceof Error ? e.message : e);
    }
  }
  return { sent, reminders: reminders.length };
}
