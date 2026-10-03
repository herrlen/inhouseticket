"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { de } from "@/lib/i18n/de";
import { acceptInvitation, joinByDomain, type JoinState } from "./actions";

type Props = { kind: "invitation"; invitationId: string } | { kind: "domain" };

export function JoinButton(props: Props) {
  const [state, action, pending] = useActionState<JoinState, FormData>(
    props.kind === "invitation" ? acceptInvitation : joinByDomain,
    {},
  );
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      {props.kind === "invitation" ? <input type="hidden" name="invitationId" value={props.invitationId} /> : null}
      <Button type="submit" variant="primary" size="sm" disabled={pending}>
        {props.kind === "invitation" ? de.start.accept : de.start.join}
      </Button>
      {state.error ? (
        <p role="alert" className="text-xs text-prio-urgent-ink">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
