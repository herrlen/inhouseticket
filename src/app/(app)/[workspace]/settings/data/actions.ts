"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { deleteWorkspace } from "@/db/queries/workspaces";
import { requireRole } from "@/lib/authz";
import { getT } from "@/lib/i18n/server";

export type DeleteState = { error?: string };

const input = z.object({ workspaceId: z.uuid(), confirm: z.string().trim().max(63) });

/** Owner only; the slug must be typed as confirmation. */
export async function deleteWorkspaceAction(_: DeleteState, formData: FormData): Promise<DeleteState> {
  const t = await getT();
  const parsed = input.safeParse({ workspaceId: formData.get("workspaceId"), confirm: formData.get("confirm") ?? "" });
  if (!parsed.success) return { error: t.data.deleteMismatch };
  const ctx = await requireRole({ workspaceId: parsed.data.workspaceId }, "owner");
  if (!(await deleteWorkspace(ctx.workspace.id, parsed.data.confirm))) return { error: t.data.deleteMismatch };
  console.info("workspace deleted by owner", { workspaceId: ctx.workspace.id, by: ctx.user.id });
  redirect("/start");
}
