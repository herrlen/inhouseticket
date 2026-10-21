// German UI strings (default locale), one file per area in ./de/ so client components bundle only the areas they use. Keep keys stable; en.ts mirrors this shape (type Messages).
import deCommon from "./de/common";
import deLegal from "./de/legal";
import deValidation from "./de/validation";
import deInput from "./de/input";
import deAuth from "./de/auth";
import deHome from "./de/home";
import deLanding from "./de/landing";
import deMigrate from "./de/migrate";
import deLogin from "./de/login";
import deRegister from "./de/register";
import deStart from "./de/start";
import deInvitePage from "./de/invitePage";
import deOnboarding from "./de/onboarding";
import deOnboardingBanner from "./de/onboardingBanner";
import deWorkspace from "./de/workspace";
import deRoles from "./de/roles";
import deMembers from "./de/members";
import deExplorer from "./de/explorer";
import deDashboard from "./de/dashboard";
import deInbox from "./de/inbox";
import deNotifications from "./de/notifications";
import deCommand from "./de/command";
import deHelp from "./de/help";
import deMe from "./de/me";
import deViews from "./de/views";
import deFilters from "./de/filters";
import deQuickAdd from "./de/quickAdd";
import deList from "./de/list";
import deTicket from "./de/ticket";
import deBoard from "./de/board";
import deView from "./de/view";
import deDetail from "./de/detail";
import deActivity from "./de/activity";
import deTickets from "./de/tickets";
import deMeta from "./de/meta";
import deParts from "./de/parts";
import dePassword from "./de/password";
import deAccount from "./de/account";
import deShell from "./de/shell";
import deProjectForm from "./de/projectForm";
import dePriority from "./de/priority";
import deProject from "./de/project";
import deProjectSettings from "./de/projectSettings";
import dePalette from "./de/palette";
import deInvite from "./de/invite";
import deAvatar from "./de/avatar";
import deClaude from "./de/claude";
import deAdmin from "./de/admin";
import deOauth from "./de/oauth";
import deData from "./de/data";
import deImport from "./de/import";

export const de = {
  common: deCommon,
  legal: deLegal,
  validation: deValidation,
  input: deInput,
  auth: deAuth,
  home: deHome,
  landing: deLanding,
  migrate: deMigrate,
  login: deLogin,
  register: deRegister,
  start: deStart,
  invitePage: deInvitePage,
  onboarding: deOnboarding,
  onboardingBanner: deOnboardingBanner,
  workspace: deWorkspace,
  roles: deRoles,
  members: deMembers,
  explorer: deExplorer,
  dashboard: deDashboard,
  inbox: deInbox,
  notifications: deNotifications,
  command: deCommand,
  help: deHelp,
  me: deMe,
  views: deViews,
  filters: deFilters,
  quickAdd: deQuickAdd,
  list: deList,
  ticket: deTicket,
  board: deBoard,
  view: deView,
  detail: deDetail,
  activity: deActivity,
  tickets: deTickets,
  meta: deMeta,
  parts: deParts,
  password: dePassword,
  account: deAccount,
  shell: deShell,
  projectForm: deProjectForm,
  priority: dePriority,
  project: deProject,
  projectSettings: deProjectSettings,
  palette: dePalette,
  invite: deInvite,
  avatar: deAvatar,
  claude: deClaude,
  admin: deAdmin,
  oauth: deOauth,
  data: deData,
  import: deImport,
} as const;

/** Literal types widened to string, so other locales can follow the same shape. */
type Widen<T> = T extends string
  ? string
  : T extends (...args: infer A) => infer R
    ? (...args: A) => Widen<R>
    : T extends readonly (infer U)[]
      ? readonly Widen<U>[]
      : T extends object
        ? { readonly [K in keyof T]: Widen<T[K]> }
        : T;

export type Messages = Widen<typeof de>;
