"use server";
// Colors of the app (Redesign X3, like emuchat): your own, or the workspace default (admins). Only
// what the theme engine accepts is stored (parseTheme: a known preset or four #rrggbb colors).
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { activity } from "@/db/schema";
import { setPersonalTheme, setWorkspaceTheme } from "@/db/queries/theme";
import { requireMember, requireRole } from "@/lib/authz";
import { getT } from "@/lib/i18n/server";
import { parseTheme, PRESETS } from "@/lib/theme/engine";

export type ThemeResult = { ok: true } | { ok: false; error: string };

/** A theme from the page, or null for "reset"; undefined = not a valid theme. */
function themeOf(value: unknown) {
  if (value === null) return null;
  return parseTheme(value) ?? undefined;
}

/** Your colors in this workspace; null = back to the workspace default. */
export async function saveMyThemeAction(workspaceId: string, value: unknown): Promise<ThemeResult> {
  const t = await getT();
  const ctx = await requireMember({ workspaceId: String(workspaceId) });
  const theme = themeOf(value);
  if (theme === undefined) return { ok: false, error: t.appearance.invalid };
  await setPersonalTheme(ctx.workspace.id, ctx.user.id, theme);
  revalidatePath(`/${ctx.workspace.slug}`, "layout");
  return { ok: true };
}

/** The workspace default (admins); null = back to Emu. */
export async function saveWorkspaceThemeAction(workspaceId: string, value: unknown): Promise<ThemeResult> {
  const t = await getT();
  const ctx = await requireRole({ workspaceId: String(workspaceId) }, "admin");
  const theme = themeOf(value);
  if (theme === undefined) return { ok: false, error: t.appearance.invalid };
  await setWorkspaceTheme(ctx.workspace.id, theme);
  await db.insert(activity).values({
    workspaceId: ctx.workspace.id,
    ticketId: null,
    actorId: ctx.user.id,
    type: "workspace_theme_changed",
    payload: { preset: theme ? (theme.preset === "custom" ? "custom" : PRESETS[theme.preset].name) : null },
  });
  revalidatePath(`/${ctx.workspace.slug}`, "layout");
  return { ok: true };
}
