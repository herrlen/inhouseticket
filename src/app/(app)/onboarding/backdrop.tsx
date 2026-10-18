// The app as a quiet, inert backdrop behind the wizard card (docs/ONBOARDING.md §1.3: the app
// already feels "there"). Pure markup, no data, hidden from assistive technology.
export function Backdrop({ name, color }: { name: string; color: string }) {
  const bar = "h-2.5 rounded-full bg-border";
  return (
    <div aria-hidden inert className="pointer-events-none fixed inset-0 flex select-none overflow-hidden bg-bg">
      <aside className="hidden w-60 shrink-0 flex-col gap-4 border-r border-border bg-surface p-4 md:flex">
        <p className="flex items-center gap-2 text-[13px] font-semibold">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
          <span className="truncate">{name}</span>
        </p>
        <div className="flex flex-col gap-3 pt-2">
          {[70, 55, 62].map((w) => (
            <span key={w} className={bar} style={{ width: `${w}%` }} />
          ))}
        </div>
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          {[48, 66, 40, 58].map((w) => (
            <span key={w} className={bar} style={{ width: `${w}%` }} />
          ))}
        </div>
      </aside>
      <div className="flex flex-1 flex-col">
        <div className="flex h-12 items-center gap-3 border-b border-border bg-surface px-4">
          <span className={bar} style={{ width: 140 }} />
          <span className="ml-auto size-7 rounded-full bg-border" />
        </div>
        <div className="grid flex-1 grid-cols-1 gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((col) => (
            <div key={col} className="flex flex-col gap-3">
              <span className={bar} style={{ width: "40%" }} />
              {Array.from({ length: 3 - (col % 2) }, (_, i) => (
                <div key={i} className="h-20 rounded-[var(--radius-card)] border border-border bg-surface" />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="absolute inset-0 bg-text/20" />
    </div>
  );
}
