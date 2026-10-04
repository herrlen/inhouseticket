import type { Metadata } from "next";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listMembers, listPendingInvitations } from "@/db/queries/members";
import { countSeats } from "@/db/queries/workspaces";
import { requireRole } from "@/lib/authz";
import { de } from "@/lib/i18n/de";
import { MAX_USERS_PER_WORKSPACE, USER_WARNING_THRESHOLD } from "@/lib/limits";
import { canChangeRole, canRemove } from "@/lib/member-permissions";
import { removeMemberAction, revokeInvitationAction, setAutoJoinAction } from "./actions";
import { InviteForm } from "./invite-form";
import { RoleForm } from "./role-form";

export const metadata: Metadata = { title: "Mitglieder" };

type Props = { params: Promise<{ workspace: string }> };

const dateFmt = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });

export default async function MembersPage({ params }: Props) {
  const { workspace: slug } = await params;
  const ctx = await requireRole({ slug }, "admin");
  const wsId = ctx.workspace.id;
  const [members, invitations, seats] = await Promise.all([listMembers(wsId), listPendingInvitations(wsId), countSeats(wsId)]);
  const actor = { role: ctx.membership.role, userId: ctx.user.id };
  const isOwner = ctx.membership.role === "owner";
  const used = seats.active + seats.pending;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 p-4 md:p-6">
      <header>
        <h1 className="text-xl font-semibold">{de.members.title}</h1>
        <p className="text-muted">{de.members.seats(seats.active, seats.pending, MAX_USERS_PER_WORKSPACE)}</p>
      </header>

      {used >= USER_WARNING_THRESHOLD ? (
        <p role="status" className="rounded-[var(--radius-card)] border border-prio-high-ink p-3 text-prio-high-ink">
          {used >= MAX_USERS_PER_WORKSPACE ? de.members.full(MAX_USERS_PER_WORKSPACE) : de.members.nearlyFull(used, MAX_USERS_PER_WORKSPACE)}
        </p>
      ) : null}

      <section aria-labelledby="invite-heading" className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
        <h2 id="invite-heading" className="mb-3 font-semibold">
          {de.members.inviteTitle}
        </h2>
        <InviteForm workspaceId={wsId} canInviteAdmins={isOwner} disabled={seats.free === 0} />
      </section>

      <section aria-labelledby="members-heading">
        <h2 id="members-heading" className="mb-2 font-semibold">
          {de.members.active(members.length)}
        </h2>
        <ul className="rounded-[var(--radius-card)] border border-border bg-surface">
          {members.map((m) => {
            const target = { role: m.role, userId: m.userId };
            return (
              <li key={m.membershipId} className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5 last:border-0">
                <Avatar user={{ id: m.userId, name: m.name, image: m.image }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {m.name}
                    {m.userId === ctx.user.id ? <span className="font-normal text-muted"> ({de.members.you})</span> : null}
                  </p>
                  <p className="truncate text-[13px] text-muted">{m.email}</p>
                </div>
                {canChangeRole(actor, target) ? (
                  <RoleForm workspaceId={wsId} membershipId={m.membershipId} name={m.name} role={m.role === "admin" ? "admin" : "member"} />
                ) : (
                  <Badge>{de.roles[m.role]}</Badge>
                )}
                {canRemove(actor, target) ? (
                  <form action={removeMemberAction}>
                    <input type="hidden" name="workspaceId" value={wsId} />
                    <input type="hidden" name="membershipId" value={m.membershipId} />
                    <Button type="submit" variant="ghost" size="sm" aria-label={de.members.removeLabel(m.name)}>
                      {de.members.remove}
                    </Button>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      {invitations.length > 0 ? (
        <section aria-labelledby="pending-heading">
          <h2 id="pending-heading" className="mb-2 font-semibold">
            {de.members.pending(invitations.length)}
          </h2>
          <ul className="rounded-[var(--radius-card)] border border-border bg-surface">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-0">
                <span className="flex-1 truncate">{inv.email}</span>
                <Badge>{de.roles[inv.role]}</Badge>
                <span className="text-[13px] text-muted">{de.members.validUntil(dateFmt.format(inv.expiresAt))}</span>
                <form action={revokeInvitationAction}>
                  <input type="hidden" name="workspaceId" value={wsId} />
                  <input type="hidden" name="invitationId" value={inv.id} />
                  <Button type="submit" variant="ghost" size="sm" aria-label={de.members.revokeLabel(inv.email)}>
                    {de.members.revoke}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {isOwner ? (
        <section aria-labelledby="autojoin-heading" className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
          <h2 id="autojoin-heading" className="mb-1 font-semibold">
            {de.members.autoJoinTitle}
          </h2>
          <p className="mb-3 text-[13px] text-muted">{de.members.autoJoinText(ctx.workspace.domain)}</p>
          <form action={setAutoJoinAction} className="flex items-center gap-3">
            <input type="hidden" name="workspaceId" value={wsId} />
            <input type="hidden" name="autoJoin" value={ctx.workspace.autoJoin ? "off" : "on"} />
            <span className="text-[13px]">{ctx.workspace.autoJoin ? de.members.autoJoinOn : de.members.autoJoinOff}</span>
            <Button type="submit" size="sm">
              {ctx.workspace.autoJoin ? de.members.disable : de.members.enable}
            </Button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
