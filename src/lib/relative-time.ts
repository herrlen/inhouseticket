import { intlLocale, type Locale } from "@/lib/i18n/locale";

const RTF: Record<Locale, Intl.RelativeTimeFormat> = {
  de: new Intl.RelativeTimeFormat(intlLocale("de"), { numeric: "auto" }),
  en: new Intl.RelativeTimeFormat(intlLocale("en"), { numeric: "auto" }),
};

/** "vor 5 Minuten", "gestern" … (en: "5 minutes ago", "yesterday") */
export function relativeTime(iso: string, now = Date.now(), locale: Locale = "de"): string {
  const rtf = RTF[locale];
  const s = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(s);
  if (abs < 60) return rtf.format(s, "second");
  if (abs < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(s / 3600), "hour");
  return rtf.format(Math.round(s / 86400), "day");
}
