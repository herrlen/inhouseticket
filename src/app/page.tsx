import Link from "next/link";
import { redirect } from "next/navigation";
import { de } from "@/lib/i18n/de";
import { getSession } from "@/lib/session";

// Placeholder until the landing page (Sprint 9).
export default async function Home() {
  if (await getSession()) redirect("/start");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-2xl font-semibold">inhouseticket</h1>
      <p className="text-muted">{de.home.claim}</p>
      <Link href="/login" className="inline-flex h-9 items-center rounded-[var(--radius-badge)] bg-accent px-3.5 font-medium text-accent-contrast">
        {de.login.title}
      </Link>
    </main>
  );
}
