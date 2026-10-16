"use client";

import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/client";
import { PALETTE, PALETTE_COLORS, paletteColorFromHex, type PaletteColor } from "@/lib/palette";

const swatches: Record<PaletteColor, string> = {
  coral: "bg-p-coral", orange: "bg-p-orange", sun: "bg-p-sun", lime: "bg-p-lime", mint: "bg-p-mint",
  turquoise: "bg-p-turquoise", blue: "bg-p-blue", indigo: "bg-p-indigo", violet: "bg-p-violet",
  pink: "bg-p-pink", berry: "bg-p-berry", slate: "bg-p-slate",
};

/** Radio group over the 12 palette colors; submits the hex value as `name`. */
export function ColorPicker({ name, legend, defaultValue, error }: { name: string; legend: string; defaultValue?: string; error?: string }) {
  const t = useT();
  const selected = (defaultValue && paletteColorFromHex(defaultValue)) || "indigo";
  return (
    <fieldset>
      <legend className="mb-2 text-[13px] font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {PALETTE_COLORS.map((c) => (
          <label key={c} className="relative">
            <input type="radio" name={name} value={PALETTE[c]} defaultChecked={c === selected} className="peer sr-only" />
            <span className="sr-only">{t.palette[c]}</span>
            <span
              aria-hidden
              className={cn(
                "block size-7 cursor-pointer rounded-full ring-offset-2 ring-offset-surface",
                "peer-checked:ring-2 peer-checked:ring-text peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-focus",
                swatches[c],
              )}
            />
          </label>
        ))}
      </div>
      {error ? <p className="mt-1 text-xs text-prio-urgent-ink">{error}</p> : null}
    </fieldset>
  );
}
