// The one icon set of the app (Redesign X2, same as emuchat's packages/ui/src/icons.tsx): Lucide
// line icons, 16 px, 1.75 stroke, currentColor. Components import icons only from here, never from
// lucide-react directly, so a swap stays one change. Each icon is its own module in lucide-react, so
// a page only bundles the icons it uses. Icons are decorative (aria-hidden) – the text next to them
// carries the meaning; an icon-only button gets an aria-label.
import {
  Archive as LArchive,
  Calendar as LCalendar,
  ChartColumn,
  Check as LCheck,
  CheckSquare as LCheckSquare,
  ChevronDown as LChevronDown,
  ChevronRight as LChevronRight,
  CornerDownRight,
  Diamond,
  ExternalLink,
  Eye as LEye,
  EyeOff as LEyeOff,
  Filter as LFilter,
  Flag,
  Folder as LFolder,
  GripVertical,
  House,
  Inbox,
  Kanban as LKanban,
  List as LList,
  Menu as LMenu,
  MessageSquare,
  MoreHorizontal,
  PanelLeft,
  Paperclip as LPaperclip,
  Plus as LPlus,
  Puzzle as LPuzzle,
  Search as LSearch,
  Settings as LSettings,
  Sparkles,
  Square,
  SquareStack,
  Star as LStar,
  User as LUser,
  Users as LUsers,
  X,
  Zap,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";
import type { ComponentType } from "react";

export type IconProps = Omit<LucideProps, "ref">;
export type Icon = ComponentType<IconProps>;

function icon(Lucide: LucideIcon, name: string): Icon {
  function AppIcon({ size = 16, strokeWidth = 1.75, ...props }: IconProps) {
    return <Lucide size={size} strokeWidth={strokeWidth} aria-hidden={props["aria-label"] ? undefined : true} focusable="false" {...props} />;
  }
  AppIcon.displayName = name;
  return AppIcon;
}

// Navigation
export const Home = icon(House, "Home");
export const InboxIcon = icon(Inbox, "InboxIcon");
export const Chart = icon(ChartColumn, "Chart");
export const Users = icon(LUsers, "Users");
export const Sparkle = icon(Sparkles, "Sparkle");
export const Archive = icon(LArchive, "Archive");
export const Puzzle = icon(LPuzzle, "Puzzle");
export const Settings = icon(LSettings, "Settings");
export const Sidebar = icon(PanelLeft, "Sidebar");
export const Menu = icon(LMenu, "Menu");
export const Search = icon(LSearch, "Search");
export const Folder = icon(LFolder, "Folder");

// Actions
export const Plus = icon(LPlus, "Plus");
export const Close = icon(X, "Close");
export const More = icon(MoreHorizontal, "More");
export const Grip = icon(GripVertical, "Grip");
export const ChevronDown = icon(LChevronDown, "ChevronDown");
export const ChevronRight = icon(LChevronRight, "ChevronRight");
export const Check = icon(LCheck, "Check");
export const Filter = icon(LFilter, "Filter");
export const OpenOut = icon(ExternalLink, "OpenOut");
export const Eye = icon(LEye, "Eye");
export const EyeOff = icon(LEyeOff, "EyeOff");
export const Bolt = icon(Zap, "Bolt");
const StarOutline = icon(LStar, "Star");
/** A favorite star; `filled` for the active state. */
export function Star({ filled, ...props }: IconProps & { filled?: boolean }) {
  return <StarOutline fill={filled ? "currentColor" : "none"} {...props} />;
}

// Content
export const CheckSquare = icon(LCheckSquare, "CheckSquare");
export const CommentIcon = icon(MessageSquare, "CommentIcon");
export const Paperclip = icon(LPaperclip, "Paperclip");
export const Priority = icon(Flag, "Priority");
export const Person = icon(LUser, "Person");
export const Calendar = icon(LCalendar, "Calendar");
export const ListIcon = icon(LList, "ListIcon");
export const KanbanIcon = icon(LKanban, "KanbanIcon");
/** Pointer from a checklist item to the subtask it becomes. */
export const SubtaskArrow = icon(CornerDownRight, "SubtaskArrow");

// Ticket types (epic → story/task → subtask), the same shapes as in emuchat
export const IconEpic = icon(Diamond, "IconEpic");
export const IconStory = icon(SquareStack, "IconStory");
export const IconTask = icon(Square, "IconTask");
export const IconSubtask = icon(LCheckSquare, "IconSubtask");
