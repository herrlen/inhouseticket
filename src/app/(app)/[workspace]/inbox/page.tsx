import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { getEmailDigest, listNotifications } from "@/db/queries/notifications";
import { requireMember } from "@/lib/authz";
import { getT } from "@/lib/i18n/server";
import { setEmailDigestAction } from "../actions";
import { InboxList } from "./inbox-list";

export const metadata: Metadata = { title: "Inbox" };

type Props = { params: Promise<{ workspace: string }> };

export default async function InboxPage({ params }: Props) {
  const t = await getT();
  const { workspace: slug } = await params;
  const ctx = await requireMember({ slug });
  const [items, digest] = await Promise.all([listNotifications(ctx.workspace.id, ctx.user.id), getEmailDigest(ctx.workspace.id, ctx.user.id)]);
  const unread = items.filter((n) => !n.readAt).length;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{t.inbox.title}</h1>
        <span className="text-[13px] text-muted">{t.inbox.unread(unread)}</span>
      </header>
      <InboxList workspaceId={ctx.workspace.id} slug={slug} items={items} />
      <form action={setEmailDigestAction} className="flex items-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-3 text-[13px]">
        <input type="hidden" name="workspaceId" value={ctx.workspace.id} />
        <input type="hidden" name="on" value={digest ? "false" : "true"} />
        <span className="font-medium">{t.inbox.digest}</span>
        <span className="text-muted">{digest ? t.inbox.digestOn : t.inbox.digestOff}</span>
        <Button type="submit" size="sm" className="ml-auto">{digest ? t.inbox.turnOff : t.inbox.turnOn}</Button>
      </form>
    </div>
  );
}
