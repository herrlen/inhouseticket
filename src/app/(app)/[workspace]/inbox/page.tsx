import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { getEmailDigest, listNotifications } from "@/db/queries/notifications";
import { requireMember } from "@/lib/authz";
import { de } from "@/lib/i18n/de";
import { setEmailDigestAction } from "../actions";
import { InboxList } from "./inbox-list";

export const metadata: Metadata = { title: "Inbox" };

type Props = { params: Promise<{ workspace: string }> };

export default async function InboxPage({ params }: Props) {
  const { workspace: slug } = await params;
  const ctx = await requireMember({ slug });
  const [items, digest] = await Promise.all([listNotifications(ctx.workspace.id, ctx.user.id), getEmailDigest(ctx.workspace.id, ctx.user.id)]);
  const unread = items.filter((n) => !n.readAt).length;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{de.inbox.title}</h1>
        <span className="text-[13px] text-muted">{de.inbox.unread(unread)}</span>
      </header>
      <InboxList workspaceId={ctx.workspace.id} slug={slug} items={items} />
      <form action={setEmailDigestAction} className="flex items-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-3 text-[13px]">
        <input type="hidden" name="workspaceId" value={ctx.workspace.id} />
        <input type="hidden" name="on" value={digest ? "false" : "true"} />
        <span className="font-medium">{de.inbox.digest}</span>
        <span className="text-muted">{digest ? de.inbox.digestOn : de.inbox.digestOff}</span>
        <Button type="submit" size="sm" className="ml-auto">{digest ? de.inbox.turnOff : de.inbox.turnOn}</Button>
      </form>
    </div>
  );
}
