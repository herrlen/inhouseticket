"use server";

import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { createInvitations, sendInvitationMails, type InvitationMail } from "@/db/queries/invitations";
import { createProjectWithDefaults, createTickets } from "@/db/queries/projects";
import { createWorkspace, findWorkspaceByDomain } from "@/db/queries/workspaces";
import { getLocale, getT } from "@/lib/i18n/server";
import { projectTemplatesFor } from "@/lib/project-templates";
import { requireUser } from "@/lib/session";
import { slugFromDomain } from "@/lib/slug";
import { isPersonalWorkspaceDomain, workspaceDomainOf } from "@/lib/workspace-domain";
import { onboardingSchema } from "@/lib/validation/workspace";

export type OnboardingState = { errors?: Partial<Record<"name" | "color" | "template" | "invites" | "form", string>> };

export async function createWorkspaceAction(_: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const t = await getT();
  const user = await requireUser();
  const domain = workspaceDomainOf(user.email);
  if (!domain) return { errors: { form: t.auth.invalidEmail } };

  const parsed = onboardingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const errors: OnboardingState["errors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof NonNullable<OnboardingState["errors"]>;
      errors[key] ??= t.validation(issue.message);
    }
    return { errors };
  }
  const input = parsed.data;
  const locale = await getLocale();
  const template = projectTemplatesFor(locale)[input.template];

  if (await findWorkspaceByDomain(domain)) redirect("/start");

  let slug: string;
  let mails: InvitationMail[] = [];
  try {
    ({ slug, mails } = await db.transaction(async (tx) => {
      const ws = await createWorkspace(tx, { name: input.name, domain, color: input.color, slugBase: isPersonalWorkspaceDomain(domain) ? input.name : slugFromDomain(domain), ownerId: user.id });
      const { project, openStatus } = await createProjectWithDefaults(tx, {
        workspaceId: ws.id,
        name: template.name,
        key: template.key,
        color: template.color,
        icon: template.icon,
      }, locale);
      await createTickets(tx, { workspaceId: ws.id, projectId: project.id, statusId: openStatus.id, createdBy: user.id, tickets: template.tickets });
      const invites = await createInvitations(tx, { workspaceId: ws.id, inviterId: user.id, emails: input.invites, role: "member" });
      return { slug: ws.slug, mails: invites.mails };
    }));
  } catch (e) {
    // Someone from the same domain was faster (unique domain) → join flow instead.
    if (String((e as { cause?: unknown })?.cause ?? e).includes("workspace_domain_unique")) redirect("/start");
    throw e;
  }

  if (mails.length > 0) await sendInvitationMails(mails, user.name, input.name);
  redirect(input.thenImport ? `/${slug}/settings/data/import` : `/${slug}`);
}
