"use client";

import { useT } from "@/lib/i18n/client";
import deAvatar from "@/lib/i18n/de/avatar";

const MESSAGES = { avatar: deAvatar };

/** Empty avatar for "nobody". Client component so Avatar stays usable in server and client trees. */
export function UnassignedAvatar({ className }: { className: string }) {
  const t = useT(MESSAGES);
  return <span role="img" aria-label={t.avatar.unassigned} className={className} />;
}
