import { de, type Messages } from "@/lib/i18n/de";

// One wording for inbox and e-mail digest.
export type NotificationLine = { type: string; actor: string | null; key: string | null; title: string | null; payload: Record<string, unknown> };

export function describeNotification(l: NotificationLine, t: Messages = de): string {
  const who = l.actor ?? t.activity.someone;
  const what = l.key ? `${l.key} ${t.common.quote(l.title ?? "")}` : t.notifications.aTicket;
  switch (l.type) {
    case "assigned":
      return t.notifications.assigned(who, what);
    case "mention":
      return t.notifications.mention(who, what);
    case "status":
      return t.notifications.status(who, what, String(l.payload.to ?? ""));
    case "due_tomorrow":
      return t.notifications.dueTomorrow(what);
    default:
      return what;
  }
}
