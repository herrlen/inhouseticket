import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { findWorkspaceByDomain } from "@/db/queries/workspaces";
import { getT } from "@/lib/i18n/server";
import { requireUser } from "@/lib/session";
import { slugFromDomain } from "@/lib/slug";
import { isPersonalWorkspaceDomain, workspaceDomainOf } from "@/lib/workspace-domain";
import { OnboardingForm } from "./onboarding-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.onboarding.title };
}

export default async function OnboardingPage() {
  const t = await getT();
  const user = await requireUser("/onboarding");
  const domain = workspaceDomainOf(user.email);
  if (!domain || (await findWorkspaceByDomain(domain))) redirect("/start");

  // Personal workspace (superadmin): suggest the last part of the local name ("len.mueller" → "Mueller").
  const base = isPersonalWorkspaceDomain(domain) ? (domain.split("@")[0]!.split(/[._-]/).at(-1) ?? "") : slugFromDomain(domain).replace(/-/g, " ");
  const suggestedName = base.charAt(0).toUpperCase() + base.slice(1);

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">{t.onboarding.title}</h1>
      <p className="mb-6 text-muted">{isPersonalWorkspaceDomain(domain) ? t.onboarding.subtitlePersonal : t.onboarding.subtitle(domain)}</p>
      <OnboardingForm suggestedName={suggestedName} />
    </>
  );
}
