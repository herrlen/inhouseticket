import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * False in the server HTML and until React has hydrated, then true. Forms whose submit is handled
 * in JavaScript keep their button disabled until then, so a native submit never fires early.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
