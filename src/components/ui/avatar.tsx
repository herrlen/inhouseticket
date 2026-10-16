import { cn } from "@/lib/cn";
import { paletteColorFor, type PaletteColor } from "@/lib/palette";
import { UnassignedAvatar } from "./avatar-unassigned";

const fills: Record<PaletteColor, string> = {
  coral: "bg-p-coral text-p-coral-on",
  orange: "bg-p-orange text-p-orange-on",
  sun: "bg-p-sun text-p-sun-on",
  lime: "bg-p-lime text-p-lime-on",
  mint: "bg-p-mint text-p-mint-on",
  turquoise: "bg-p-turquoise text-p-turquoise-on",
  blue: "bg-p-blue text-p-blue-on",
  indigo: "bg-p-indigo text-p-indigo-on",
  violet: "bg-p-violet text-p-violet-on",
  pink: "bg-p-pink text-p-pink-on",
  berry: "bg-p-berry text-p-berry-on",
  slate: "bg-p-slate text-p-slate-on",
};

const sizes = { sm: "size-5 text-[10px]", md: "size-7 text-xs", lg: "size-9 text-sm" } as const;

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

export type AvatarProps = {
  /** null = unassigned. */
  user: { id: string; name: string; image?: string | null } | null;
  size?: keyof typeof sizes;
  className?: string;
};

export function Avatar({ user, size = "md", className }: AvatarProps) {
  const base = cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none", sizes[size], className);

  if (!user) {
    return <UnassignedAvatar className={cn(base, "border border-dashed border-muted")} />;
  }
  if (user.image) {
    // eslint-disable-next-line @next/next/no-img-element -- tiny avatars, no optimizer round-trip needed
    return <img src={user.image} alt={user.name} className={cn(base, "object-cover")} />;
  }
  return (
    <span role="img" aria-label={user.name} className={cn(base, fills[paletteColorFor(user.id)])}>
      <span aria-hidden>{initials(user.name)}</span>
    </span>
  );
}
