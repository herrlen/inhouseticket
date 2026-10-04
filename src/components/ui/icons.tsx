import type { SVGProps } from "react";

// Small inline icon set (16px grid, stroke-based) – no icon library in the bundle.
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable={false}
      {...props}
    >
      {children}
    </svg>
  );
}

export const ChevronRight = (p: IconProps) => <Svg {...p}><path d="M6 4l4 4-4 4" /></Svg>;
export const ChevronDown = (p: IconProps) => <Svg {...p}><path d="M4 6l4 4 4-4" /></Svg>;
export const Plus = (p: IconProps) => <Svg {...p}><path d="M8 3v10M3 8h10" /></Svg>;
export const Star = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Svg {...p}>
    <path d="M8 2.5l1.7 3.5 3.8.5-2.8 2.6.7 3.8L8 11.1l-3.4 1.8.7-3.8L2.5 6.5l3.8-.5z" fill={filled ? "currentColor" : "none"} />
  </Svg>
);
export const Folder = (p: IconProps) => <Svg {...p}><path d="M2 4.5A1.5 1.5 0 013.5 3h2.6l1.5 1.5h4.9A1.5 1.5 0 0114 6v5.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5z" /></Svg>;
export const Sidebar = (p: IconProps) => <Svg {...p}><rect x="2" y="3" width="12" height="10" rx="1.5" /><path d="M6 3v10" /></Svg>;
export const Menu = (p: IconProps) => <Svg {...p}><path d="M2.5 4h11M2.5 8h11M2.5 12h11" /></Svg>;
export const More = (p: IconProps) => <Svg {...p}><circle cx="3.5" cy="8" r=".75" fill="currentColor" /><circle cx="8" cy="8" r=".75" fill="currentColor" /><circle cx="12.5" cy="8" r=".75" fill="currentColor" /></Svg>;
export const Home = (p: IconProps) => <Svg {...p}><path d="M2.5 7L8 2.5 13.5 7v6a.5.5 0 01-.5.5H10V10H6v3.5H3a.5.5 0 01-.5-.5z" /></Svg>;
export const Users = (p: IconProps) => <Svg {...p}><circle cx="6" cy="5.5" r="2.5" /><path d="M1.5 13.5c.5-2.5 2.3-3.5 4.5-3.5s4 1 4.5 3.5M10.5 3.2a2.5 2.5 0 010 4.6M12 10.2c1.3.5 2.2 1.5 2.5 3.3" /></Svg>;
export const Settings = (p: IconProps) => <Svg {...p}><circle cx="8" cy="8" r="2" /><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" /></Svg>;
export const Close = (p: IconProps) => <Svg {...p}><path d="M4 4l8 8M12 4l-8 8" /></Svg>;
export const Grip = (p: IconProps) => (
  <Svg {...p}>
    {[5, 8, 11].flatMap((y) => [6, 10].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r=".7" fill="currentColor" stroke="none" />))}
  </Svg>
);
export const Archive = (p: IconProps) => <Svg {...p}><rect x="2" y="3" width="12" height="3" rx=".5" /><path d="M3 6v6.5a.5.5 0 00.5.5h9a.5.5 0 00.5-.5V6M6.5 8.5h3" /></Svg>;
export const CheckSquare = (p: IconProps) => <Svg {...p}><rect x="2.5" y="2.5" width="11" height="11" rx="2" /><path d="M5.5 8l1.8 1.8L10.5 6" /></Svg>;
export const CommentIcon = (p: IconProps) => <Svg {...p}><path d="M3 3.5h10a1 1 0 011 1v6a1 1 0 01-1 1H7l-3 2.5v-2.5H3a1 1 0 01-1-1v-6a1 1 0 011-1z" /></Svg>;
export const Paperclip = (p: IconProps) => <Svg {...p}><path d="M10.5 5l-4.6 4.6a1.2 1.2 0 001.7 1.7L12.5 6.4a2.5 2.5 0 00-3.5-3.5L4 7.9a3.7 3.7 0 005.3 5.3l3.2-3.2" /></Svg>;
export const InboxIcon = (p: IconProps) => <Svg {...p}><path d="M2.5 9.5l1.6-5.2A1 1 0 015 3.5h6a1 1 0 01.9.8l1.6 5.2v3a1 1 0 01-1 1h-9a1 1 0 01-1-1z" /><path d="M2.5 9.5h3l1 1.5h3l1-1.5h3" /></Svg>;
export const Sparkle = (p: IconProps) => <Svg {...p}><path d="M8 2v3M8 11v3M2 8h3M11 8h3M4.2 4.2l1.6 1.6M10.2 10.2l1.6 1.6M4.2 11.8l1.6-1.6M10.2 5.8l1.6-1.6" /></Svg>;
export const Chart = (p: IconProps) => <Svg {...p}><path d="M2.5 13.5h11M4.5 11V8M8 11V4.5M11.5 11V7" /></Svg>;
