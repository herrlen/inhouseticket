"use client";

import { createContext, useContext } from "react";

export type ShellInfo = { workspaceId: string; slug: string; workspaceName: string; workspaceColor: string; canAdmin: boolean; isSuperadmin: boolean };

const ShellContext = createContext<ShellInfo | null>(null);

export const ShellProvider = ShellContext.Provider;

export function useShell(): ShellInfo {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used inside the workspace shell");
  return ctx;
}
