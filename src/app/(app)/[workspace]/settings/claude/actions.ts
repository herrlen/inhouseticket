"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createApiToken, MAX_TOKENS_PER_USER, revokeApiToken } from "@/db/queries/api-tokens";
import { requireMember } from "@/lib/authz";
import { de } from "@/lib/i18n/de";
import { resolveExpiry } from "@/lib/token-expiry";
import { todayInBerlin } from "@/components/tickets/list-model";

export type TokenState = { error?: string; token?: string };

const createSchema = z.object({ workspaceId: z.uuid(), name: z.string().trim().min(1).max(60) });
const revokeSchema = z.object({ workspaceId: z.uuid(), tokenId: z.uuid() });
const path = (slug: string) => `/${slug}/settings/claude`;

export async function createTokenAction(_: TokenState, formData: FormData): Promise<TokenState> {
  const parsed = createSchema.safeParse({ workspaceId: formData.get("workspaceId"), name: formData.get("name") ?? "" });
  if (!parsed.success) return { error: de.claude.nameInvalid };
  const expiry = resolveExpiry(String(formData.get("expiry") ?? ""), (formData.get("expiryDate") as string | null) || null, todayInBerlin());
  if (!expiry.ok) return { error: de.claude.expiryInvalid };
  const ctx = await requireMember({ workspaceId: parsed.data.workspaceId });
  const res = await createApiToken(ctx.workspace.id, ctx.user.id, parsed.data.name, expiry.expiresAt);
  if ("error" in res) return { error: de.claude.limit(MAX_TOKENS_PER_USER) };
  revalidatePath(path(ctx.workspace.slug));
  return { token: res.token };
}

export async function revokeTokenAction(formData: FormData) {
  const parsed = revokeSchema.safeParse({ workspaceId: formData.get("workspaceId"), tokenId: formData.get("tokenId") });
  if (!parsed.success) return;
  const ctx = await requireMember({ workspaceId: parsed.data.workspaceId });
  await revokeApiToken(ctx.workspace.id, ctx.user.id, parsed.data.tokenId);
  revalidatePath(path(ctx.workspace.slug));
}
