// Client-side access to the UI strings. Server code uses getT() from ./server instead.
import { de, type Messages } from "./de";
import { loadedEn } from "./load-en";
import { useLocale } from "./locale-provider";

export { useLocale };

/** Messages of the current locale. German is bundled; English was loaded by LocaleProvider. */
export function useT(): Messages {
  const locale = useLocale();
  return locale === "en" ? (loadedEn() ?? de) : de;
}
