"use client";

import { useActionState, useEffect, useState } from "react";
import { createFolderAction, createProjectAction, renameFolderAction, type FormState } from "@/app/(app)/[workspace]/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/client";
import { MAX_PROJECT_KEY } from "@/lib/limits";
import { suggestProjectKey } from "@/lib/project-key";
import type { FolderItem } from "./model";
import deCommon from "@/lib/i18n/de/common";
import deExplorer from "@/lib/i18n/de/explorer";
import deProjectForm from "@/lib/i18n/de/projectForm";

const MESSAGES = { common: deCommon, explorer: deExplorer, projectForm: deProjectForm };

export function NewProjectDialog({ open, folderId, folders, onClose }: { open: boolean; folderId: string | null; folders: FolderItem[]; onClose: () => void }) {
  const t = useT(MESSAGES);
  return (
    <Dialog open={open} onClose={onClose} title={t.explorer.newProject}>
      {/* Remount per opening so the form starts empty. */}
      {open ? <NewProjectForm folderId={folderId} folders={folders} onCancel={onClose} /> : null}
    </Dialog>
  );
}

function NewProjectForm({ folderId, folders, onCancel }: { folderId: string | null; folders: FolderItem[]; onCancel: () => void }) {
  const t = useT(MESSAGES);
  const { workspaceId } = useShell();
  const [state, action, pending] = useActionState<FormState, FormData>(createProjectAction, {});
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const shownKey = keyTouched ? key : name ? suggestProjectKey(name) : "";
  const e = state.fieldErrors ?? {};

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <Input name="name" label={t.projectForm.name} value={name} onChange={(ev) => setName(ev.target.value)} maxLength={100} autoFocus required error={e.name} />
      <Input
        name="key"
        label={t.projectForm.key}
        value={shownKey}
        onChange={(ev) => {
          setKeyTouched(true);
          setKey(ev.target.value.toUpperCase());
        }}
        maxLength={MAX_PROJECT_KEY}
        hint={t.projectForm.keyHint(shownKey || "KEY")}
        error={e.key}
        inputClassName="font-mono"
      />
      <ColorPicker name="color" legend={t.projectForm.color} error={e.color} />
      <Input name="icon" label={t.projectForm.icon} placeholder={t.projectForm.iconPlaceholder} maxLength={16} hint={t.projectForm.iconHint} error={e.icon} />
      {folders.length > 0 ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="new-project-folder" className="text-[13px] font-medium">
            {t.projectForm.folder}
          </label>
          <select id="new-project-folder" name="folderId" defaultValue={folderId ?? ""} className="h-9 rounded-[var(--radius-badge)] border border-border bg-surface px-2 text-sm">
            <option value="">{t.projectForm.noFolder}</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {state.error ? <p role="alert" className="text-[13px] text-prio-urgent-ink">{state.error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel}>{t.common.cancel}</Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {t.common.create}
        </Button>
      </div>
    </form>
  );
}

export function FolderNameDialog({ open, folder, onClose }: { open: boolean; folder: FolderItem | null; onClose: () => void }) {
  const t = useT(MESSAGES);
  return (
    <Dialog open={open} onClose={onClose} title={folder ? t.explorer.renameFolder : t.explorer.newFolder}>
      {open ? <FolderNameForm folder={folder} onDone={onClose} /> : null}
    </Dialog>
  );
}

function FolderNameForm({ folder, onDone }: { folder: FolderItem | null; onDone: () => void }) {
  const t = useT(MESSAGES);
  const { workspaceId } = useShell();
  const [state, action, pending] = useActionState<FormState, FormData>(folder ? renameFolderAction : createFolderAction, {});
  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      {folder ? <input type="hidden" name="folderId" value={folder.id} /> : null}
      <Input name="name" label={t.explorer.folderName} defaultValue={folder?.name} maxLength={100} autoFocus required error={state.fieldErrors?.name} />
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>{t.common.cancel}</Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {folder ? t.common.save : t.common.create}
        </Button>
      </div>
    </form>
  );
}
