"use client";

import { useT } from "@/lib/i18n/client";

/** Empty avatar for "nobody". Client component so Avatar stays usable in server and client trees. */
export function UnassignedAvatar({ className }: { className: string }) {
  const t = useT();
  return <span role="img" aria-label={t.avatar.unassigned} className={className} />;
}
