import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

const variants = {
  primary: "bg-accent text-accent-contrast hover:bg-accent-hover",
  secondary: "border border-border bg-surface text-text hover:bg-hover",
  ghost: "text-text hover:bg-hover",
  danger: "border border-prio-urgent-ink bg-surface text-prio-urgent-ink hover:bg-prio-urgent/10",
} as const;

const sizes = {
  sm: "h-7 gap-1.5 px-2.5 text-[13px]",
  md: "h-9 gap-2 px-3.5 text-sm",
  icon: "size-8 justify-center",
} as const;

export type ButtonProps = ComponentProps<"button"> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
};

export function Button({ variant = "secondary", size = "md", type = "button", className, ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center rounded-[var(--radius-field)] font-medium whitespace-nowrap",
        "transition-[background-color,opacity] duration-micro ease-out-quick",
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
