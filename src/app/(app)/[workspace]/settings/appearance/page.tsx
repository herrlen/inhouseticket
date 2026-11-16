import type { Metadata } from "next";
import { getThemes } from "@/db/queries/theme";
import { hasRole, requireMember } from "@/lib/authz";
import { getT } from "@/lib/i18n/server";
import { parseTheme } from "@/lib/theme/engine";
import { ThemeForm } from "./theme-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).appearance.title };
}

type Props = { params: Promise<{ workspace: string }> };

/** Darstellung (Redesign X3): your own colors for everyone; the workspace default for admins. */
export default async function AppearancePage({ params }: Props) {
  const t = await getT();
  const { workspace: slug } = await params;
  const ctx = await requireMember({ slug });
  const themes = await getThemes(ctx.workspace.id, ctx.user.id);
  const section = "flex flex-col gap-4 rounded-[var(--radius-card)] border border-border bg-surface p-4";

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 p-4 md:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{t.appearance.title}</h1>
        <p className="text-[13px] text-muted">{t.appearance.intro}</p>
      </header>

      <section aria-labelledby="theme-mine" className={section}>
        <div>
          <h2 id="theme-mine" className="font-semibold">
            {t.appearance.mineTitle}
          </h2>
          <p className="text-[13px] text-muted">{t.appearance.mineText}</p>
        </div>
        <ThemeForm scope="user" workspaceId={ctx.workspace.id} initial={parseTheme(themes.personal) ?? parseTheme(themes.workspace)} />
      </section>

      {hasRole(ctx, "admin") ? (
        <section aria-labelledby="theme-workspace" className={section}>
          <div>
            <h2 id="theme-workspace" className="font-semibold">
              {t.appearance.workspaceTitle}
            </h2>
            <p className="text-[13px] text-muted">{t.appearance.workspaceText}</p>
          </div>
          <ThemeForm scope="workspace" workspaceId={ctx.workspace.id} initial={parseTheme(themes.workspace)} />
        </section>
      ) : null}
    </div>
  );
}
