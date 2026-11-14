"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import type { ContainerNode } from "@/lib/integrations/types";
import { saveSelectionAction, type SelectionState } from "./actions";
import deIntegrations from "@/lib/i18n/de/integrations";

const MESSAGES = { integrations: deIntegrations };

const box = "size-4 rounded border-border accent-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** Space → folder → list as nested fieldsets with native checkboxes (keyboard and screen reader friendly). */
export function SelectionForm({ workspaceId, tree, spaceIds, listIds, submitLabel }: { workspaceId: string; tree: ContainerNode[]; spaceIds: string[]; listIds: string[]; submitLabel: string }) {
  const t = useT(MESSAGES);
  const c = t.integrations.clickup;
  const [state, action, pending] = useActionState<SelectionState, FormData>(saveSelectionAction, {});
  const listBox = (l: ContainerNode) => (
    <li key={l.id}>
      <label className="flex items-center gap-2 py-0.5 text-[13px]">
        <input type="checkbox" name="list" value={l.id} defaultChecked={listIds.includes(l.id)} className={box} />
        {l.name}
      </label>
    </li>
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      {tree.length === 0 ? <p className="text-[13px] text-muted">{c.noSpaces}</p> : null}
      {tree.map((space) => (
        <fieldset key={space.id} className="rounded-[var(--radius-card)] border border-border bg-surface p-3">
          <legend className="px-1 font-semibold">{space.name}</legend>
          <label className="flex items-center gap-2 py-1 text-[13px] font-medium">
            <input type="checkbox" name="space" value={space.id} defaultChecked={spaceIds.includes(space.id)} className={box} />
            {c.wholeSpace(space.name)}
          </label>
          {space.children.length === 0 ? <p className="pl-6 text-[13px] text-muted">{c.noLists}</p> : null}
          <ul className="pl-6">
            {space.children.map((child) =>
              child.kind === "folder" ? (
                <li key={child.id} className="py-1">
                  <span className="text-[13px] text-muted">{c.folder(child.name)}</span>
                  <ul className="pl-4">{child.children.map(listBox)}</ul>
                </li>
              ) : (
                listBox(child)
              ),
            )}
          </ul>
        </fieldset>
      ))}
      <p role="alert" className="text-[13px] text-prio-urgent-ink empty:hidden">
        {state.error ?? ""}
      </p>
      <div>
        <Button type="submit" variant="primary" disabled={pending || tree.length === 0}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
