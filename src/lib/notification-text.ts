import { de } from "@/lib/i18n/de";

// One wording for inbox and e-mail digest.
export type NotificationLine = { type: string; actor: string | null; key: string | null; title: string | null; payload: Record<string, unknown> };

export function describeNotification(l: NotificationLine): string {
  const who = l.actor ?? de.activity.someone;
  const what = l.key ? `${l.key} „${l.title ?? ""}“` : de.notifications.aTicket;
  switch (l.type) {
    case "assigned":
      return de.notifications.assigned(who, what);
    case "mention":
      return de.notifications.mention(who, what);
    case "status":
      return de.notifications.status(who, what, String(l.payload.to ?? ""));
    case "due_tomorrow":
      return de.notifications.dueTomorrow(what);
    default:
      return what;
  }
}
