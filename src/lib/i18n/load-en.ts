// The English messages load as a separate chunk: German pages keep their bundle unchanged.
import type { Messages } from "./de";

let loaded: Messages | undefined;
let pending: Promise<Messages> | undefined;

export function loadEn(): Promise<Messages> {
  return (pending ??= import("./en").then((m) => (loaded = m.en)));
}

export function loadedEn(): Messages | undefined {
  return loaded;
}
