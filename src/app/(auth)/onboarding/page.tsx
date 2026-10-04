import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { findWorkspaceByDomain } from "@/db/queries/workspaces";
import { de } from "@/lib/i18n/de";
import { requireUser } from "@/lib/session";
import { slugFromDomain } from "@/lib/slug";
import { isPersonalWorkspaceDomain, workspaceDomainOf } from "@/lib/workspace-domain";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Workspace anlegen" };

export default async function OnboardingPage() {
  const user = await requireUser("/onboarding");
  const domain = workspaceDomainOf(user.email);
  if (!domain || (await findWorkspaceByDomain(domain))) redirect("/start");

  // Personal workspace (superadmin): suggest the last part of the local name ("len.mueller" → "Mueller").
  const base = isPersonalWorkspaceDomain(domain) ? (domain.split("@")[0]!.split(/[._-]/).at(-1) ?? "") : slugFromDomain(domain).replace(/-/g, " ");
  const suggestedName = base.charAt(0).toUpperCase() + base.slice(1);

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">{de.onboarding.title}</h1>
      <p className="mb-6 text-muted">{isPersonalWorkspaceDomain(domain) ? de.onboarding.subtitlePersonal : de.onboarding.subtitle(domain)}</p>
      <OnboardingForm suggestedName={suggestedName} />
    </>
  );
}
