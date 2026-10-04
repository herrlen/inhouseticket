import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { findWorkspaceByDomain, listOpenInvitations, listWorkspacesForUser } from "@/db/queries/workspaces";
import { workspaceDomainOf } from "@/lib/workspace-domain";
import { de } from "@/lib/i18n/de";
import { requireUser } from "@/lib/session";
import { SignOutButton } from "@/components/sign-out-button";
import { JoinButton } from "./join-button";

export const metadata: Metadata = { title: "Start" };

/** Decides where a signed-in user goes: their workspace, an invitation, joining, or onboarding. */
export default async function StartPage() {
  const user = await requireUser();
  const [workspaces, invitations] = await Promise.all([listWorkspacesForUser(user.id), listOpenInvitations(user.email)]);

  if (workspaces.length === 1 && invitations.length === 0) redirect(`/${workspaces[0]!.slug}`);

  const domain = workspaceDomainOf(user.email);
  const own = domain ? await findWorkspaceByDomain(domain) : null;
  const isMemberOfOwn = own ? workspaces.some((w) => w.id === own.id) : false;

  if (workspaces.length === 0 && invitations.length === 0 && !own) redirect("/onboarding");

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">{de.start.title(user.name)}</h1>
      <p className="mb-6 text-muted">{user.email}</p>

      {workspaces.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-2 text-[13px] font-medium text-muted">{de.start.yourWorkspaces}</h2>
          <ul className="flex flex-col gap-1">
            {workspaces.map((w) => (
              <li key={w.id}>
                <Link href={`/${w.slug}`} className="flex items-center gap-2 rounded-[var(--radius-badge)] px-2 py-1.5 hover:bg-bg">
                  <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: w.color }} />
                  {w.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {invitations.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-2 text-[13px] font-medium text-muted">{de.start.invitations}</h2>
          <ul className="flex flex-col gap-3">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-3">
                <span>{de.start.invitedBy(inv.inviterName, inv.workspaceName)}</span>
                <JoinButton kind="invitation" invitationId={inv.id} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {own && !isMemberOfOwn ? (
        <section className="mb-6">
          {own.autoJoin ? (
            <div className="flex items-center justify-between gap-3">
              <span>{de.start.domainWorkspace(own.name)}</span>
              <JoinButton kind="domain" />
            </div>
          ) : (
            <p className="text-muted">{de.start.askForInvite(own.name, domain!)}</p>
          )}
        </section>
      ) : null}

      <SignOutButton />
    </>
  );
}
