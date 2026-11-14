"use client";

import { createContext, useContext } from "react";
import type { LegalLink } from "@/lib/instance";

export type ShellInfo = {
  workspaceId: string;
  slug: string;
  workspaceName: string;
  workspaceColor: string;
  canAdmin: boolean;
  isSuperadmin: boolean;
  /** Start view chosen in the onboarding wizard: project links open it (docs/ONBOARDING.md §6). */
  defaultView: "list" | "board";
  /** Legal links of this deployment (src/lib/instance.ts): ours, or the company instance's own. */
  legalLinks: LegalLink[];
};

/** Link to a project in the person's start view; /p/KEY alone stays the list. */
export function projectHref(shell: Pick<ShellInfo, "slug" | "defaultView">, key: string): string {
  return `/${shell.slug}/p/${key}${shell.defaultView === "board" ? "?view=board" : ""}`;
}

const ShellContext = createContext<ShellInfo | null>(null);

export const ShellProvider = ShellContext.Provider;

export function useShell(): ShellInfo {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used inside the workspace shell");
  return ctx;
}
