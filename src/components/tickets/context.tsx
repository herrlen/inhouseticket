"use client";

import { createContext, useContext } from "react";
import type { LabelRow, MemberOption } from "@/db/queries/tickets";
import type { StatusOption } from "./list-model";

export type ProjectInfo = {
  workspaceId: string;
  slug: string;
  project: { id: string; key: string; name: string; color: string; icon?: string | null };
  statuses: StatusOption[];
  members: MemberOption[];
  labels: LabelRow[];
  currentUserId: string;
};

const Ctx = createContext<ProjectInfo | null>(null);
export const ProjectInfoProvider = Ctx.Provider;

export function useProjectInfo(): ProjectInfo {
  const v = useContext(Ctx);
  if (!v) throw new Error("useProjectInfo outside of the project view");
  return v;
}
