// Client-side access to the UI strings. Server code uses getT() from ./server instead.
// Client components never import the whole of ./de: each passes the areas it uses (from ./de/<area>),
// so a page bundles only those (CLAUDE.md rule 4). Define the object at module scope – it is the cache key.
import type { Messages } from "./de";
import { loadedEn } from "./load-en";
import { useLocale } from "./locale-provider";

export { useLocale };

const english = new WeakMap<object, object>();

/** The given German areas, or the same areas in English (loaded by LocaleProvider). */
export function useT<K extends keyof Messages>(areas: Pick<Messages, K>): Pick<Messages, K> {
  const en = useLocale() === "en" ? loadedEn() : undefined;
  if (!en) return areas;
  let picked = english.get(areas) as Pick<Messages, K> | undefined;
  if (!picked) {
    picked = Object.fromEntries(Object.keys(areas).map((k) => [k, en[k as K]])) as Pick<Messages, K>;
    english.set(areas, picked);
  }
  return picked;
}
