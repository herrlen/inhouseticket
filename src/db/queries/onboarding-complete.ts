import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { label, project, status, subtask, ticket, ticketLabel, user, userPref, workspace } from "@/db/schema";
import { nextTicketNumber } from "@/db/queries/projects";
import { asLimitError, type Tx } from "@/db/queries/workspaces";
import { keyBetween } from "@/lib/fractional";
import type { Locale } from "@/lib/i18n/locale";
import { DEFAULT_VIEW, TEAM_TYPES, type TeamType, type View } from "@/lib/onboarding/options";
import { buildTemplate } from "@/lib/onboarding/templates";
import { PALETTE_COLORS, PALETTE } from "@/lib/palette";
import { initialSortKey } from "@/lib/sort-key";
import { dueDateToTimestamp } from "@/lib/validation/ticket";

/** "YYYY-MM-DD" today in the person's time zone (falls back to Berlin). */
function todayIn(timeZone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  }
}

/** The template key, or KEY2, KEY3 … if the owner already created a project with it ("Später"). */
async function freeKey(tx: Tx, workspaceId: string, base: string): Promise<string> {
  const rows = await tx.select({ key: project.key }).from(project).where(eq(project.workspaceId, workspaceId));
  const taken = new Set(rows.map((r) => r.key));
  for (let i = 1; ; i++) {
    const key = i === 1 ? base : `${base.slice(0, 9 - String(i).length)}${i}`;
    if (!taken.has(key)) return key;
  }
}

/**
 * End of the owner wizard (docs/ONBOARDING.md §2.3), inside the caller's transaction: the project
 * from the team area's template with statuses, labels and tutorial tickets incl. subtasks, ticket
 * numbers reserved atomically; then the workspace and the person count as onboarded. Locks the
 * workspace row first, so a double submit waits and then finds it done (nothing twice).
 */
export async function completeOnboarding(
  tx: Tx,
  input: { workspaceId: string; userId: string; locale: Locale; invited: boolean },
): Promise<{ target: string; created: boolean }> {
  const [ws] = await tx
    .select({ slug: workspace.slug, completedAt: workspace.onboardingCompletedAt, teamType: workspace.teamType })
    .from(workspace)
    .where(eq(workspace.id, input.workspaceId))
    .for("update")
    .limit(1);
  if (!ws) throw new Error("workspace_not_found");
  if (ws.completedAt) return { target: `/${ws.slug}`, created: false };

  const [pref] = await tx
    .select({ defaultView: userPref.defaultView })
    .from(userPref)
    .where(and(eq(userPref.workspaceId, input.workspaceId), eq(userPref.userId, input.userId)))
    .limit(1);
  const [person] = await tx.select({ timezone: user.timezone }).from(user).where(eq(user.id, input.userId)).limit(1);
  const view = (pref?.defaultView as View | undefined) ?? DEFAULT_VIEW;
  const teamType: TeamType = TEAM_TYPES.includes(ws.teamType as TeamType) ? (ws.teamType as TeamType) : "general";
  const tpl = buildTemplate(teamType, { locale: input.locale, view, invited: input.invited });
  const key = await freeKey(tx, input.workspaceId, tpl.key);

  const [last] = await tx
    .select({ sort: project.sort })
    .from(project)
    .where(and(eq(project.workspaceId, input.workspaceId), isNull(project.folderId)))
    .orderBy(sql`${project.sort} desc`)
    .limit(1);
  const [created] = await tx
    .insert(project)
    .values({ workspaceId: input.workspaceId, name: tpl.name, key, color: tpl.color, icon: tpl.icon, sort: keyBetween(last?.sort ?? null, null) })
    .returning({ id: project.id });
  const projectId = created!.id;

  const statuses = await tx
    .insert(status)
    .values(tpl.statuses.map((s, i) => ({ workspaceId: input.workspaceId, projectId, name: s.name, color: s.color, category: s.category, sort: initialSortKey(i) })))
    .returning({ id: status.id, category: status.category });
  const openStatus = statuses.find((s) => s.category === "open") ?? statuses[0]!;

  const labels = await tx
    .insert(label)
    .values(tpl.labels.map((name, i) => ({ workspaceId: input.workspaceId, projectId, name, color: PALETTE[PALETTE_COLORS[(i * 5) % PALETTE_COLORS.length]!] })))
    .returning({ id: label.id, name: label.name });
  const labelId = new Map(labels.map((l) => [l.name, l.id]));

  const today = dueDateToTimestamp(todayIn(person?.timezone ?? "Europe/Berlin"));
  try {
    for (const [i, t] of tpl.tickets.entries()) {
      const number = await nextTicketNumber(tx, projectId);
      const [row] = await tx
        .insert(ticket)
        .values({
          workspaceId: input.workspaceId,
          projectId,
          number,
          title: t.title,
          description: t.description ?? null,
          priority: t.priority,
          statusId: openStatus.id,
          assigneeId: t.mine ? input.userId : null,
          dueAt: t.mine ? today : null,
          sort: initialSortKey(i),
          createdBy: input.userId,
        })
        .returning({ id: ticket.id });
      const ticketId = row!.id;
      const ids = t.labels.map((name) => labelId.get(name)).filter((id): id is string => Boolean(id));
      if (ids.length > 0) await tx.insert(ticketLabel).values(ids.map((id) => ({ ticketId, labelId: id, projectId })));
      if (t.subtasks.length > 0) {
        await tx.insert(subtask).values(t.subtasks.map((title, j) => ({ workspaceId: input.workspaceId, ticketId, title, sort: initialSortKey(j) })));
      }
    }
  } catch (e) {
    // The subtask trigger (max 5) guards the templates as well; templates.test.ts keeps them below.
    throw asLimitError(e) ?? e;
  }

  const now = new Date();
  await tx.update(workspace).set({ onboardingCompletedAt: now }).where(eq(workspace.id, input.workspaceId));
  await tx.update(user).set({ onboardedAt: now }).where(and(eq(user.id, input.userId), isNull(user.onboardedAt)));
  await tx.update(userPref).set({ onboardingStep: null }).where(and(eq(userPref.workspaceId, input.workspaceId), eq(userPref.userId, input.userId)));
  return { target: `/${ws.slug}/p/${key}${view === "board" ? "?view=board" : ""}`, created: true };
}
