"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { NotificationRow } from "@/db/queries/notifications";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/relative-time";
import { cn } from "@/lib/cn";
import { de } from "@/lib/i18n/de";
import { describeNotification } from "@/lib/notification-text";
import { markNotificationsReadAction } from "../actions";

const text = (n: NotificationRow) =>
  describeNotification({ type: n.type, actor: n.actorName, key: n.ticketKey, title: n.ticketTitle, payload: n.payload });

export function InboxList({ workspaceId, slug, items: initial }: { workspaceId: string; slug: string; items: NotificationRow[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [, startTransition] = useTransition();
  const unread = items.filter((n) => !n.readAt);

  const markRead = (ids?: string[]) => {
    const now = new Date().toISOString();
    setItems((all) => all.map((n) => (!ids || ids.includes(n.id) ? { ...n, readAt: n.readAt ?? now } : n)));
    startTransition(async () => {
      await markNotificationsReadAction({ workspaceId, ids });
      router.refresh();
    });
  };

  if (items.length === 0) return <p className="rounded-[var(--radius-card)] border border-dashed border-border p-8 text-center text-muted">{de.inbox.empty}</p>;

  return (
    <div className="flex flex-col gap-2">
      {unread.length > 0 ? (
        <div className="flex justify-end">
          <Button size="sm" variant="ghost" onClick={() => markRead()}>{de.inbox.markAll}</Button>
        </div>
      ) : null}
      <ul className="rounded-[var(--radius-card)] border border-border bg-surface">
        {items.map((n) => {
          const href = n.projectKey && n.ticketKey ? `/${slug}/p/${n.projectKey}?t=${n.ticketKey}` : `/${slug}`;
          return (
            <li key={n.id} className="border-b border-border last:border-0">
              <Link
                href={href}
                onClick={() => !n.readAt && markRead([n.id])}
                className={cn("flex items-start gap-3 px-4 py-3 text-[13px] hover:bg-bg", !n.readAt && "font-medium")}
              >
                <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-accent")} />
                <span className="min-w-0 flex-1">
                  {text(n)}
                  {!n.readAt ? <span className="sr-only"> ({de.notifications.unreadSr})</span> : null}
                </span>
                {/* Relative time differs by a few seconds between server render and hydration – expected. */}
                <time dateTime={n.createdAt} suppressHydrationWarning className="shrink-0 text-xs font-normal text-muted">{relativeTime(n.createdAt)}</time>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
