"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { deleteWorkspaceForAdmin, setWorkspaceLocked } from "@/db/queries/admin";
import { requireSuperadmin } from "@/lib/superadmin";

const ref = z.object({ workspaceId: z.uuid() });

// Operator actions are logged (ids only, no content) so they can be traced later.
const audit = (action: string, by: string, workspaceId: string) => console.info(`superadmin: ${action}`, { by, workspaceId });

export async function setLockedAction(formData: FormData) {
  const user = await requireSuperadmin();
  const { workspaceId } = ref.parse({ workspaceId: formData.get("workspaceId") });
  const locked = formData.get("locked") === "on";
  await setWorkspaceLocked(workspaceId, locked);
  audit(locked ? "lock" : "unlock", user.id, workspaceId);
  revalidatePath("/admin");
}

export async function deleteWorkspaceAction(formData: FormData) {
  const user = await requireSuperadmin();
  const { workspaceId } = ref.parse({ workspaceId: formData.get("workspaceId") });
  const ok = await deleteWorkspaceForAdmin(workspaceId, String(formData.get("confirm") ?? "").trim());
  if (ok) audit("delete", user.id, workspaceId);
  revalidatePath("/admin");
  redirect(`/admin?${ok ? "deleted=1" : "mismatch=1"}`);
}
