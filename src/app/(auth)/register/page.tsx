import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n/server";
import { getSession, safeNext } from "@/lib/session";
import { RegisterForm } from "./register-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).register.title };
}

type Props = { searchParams: Promise<{ next?: string | string[] }> };

/** Registration with name, company address and password; the account follows the mailed link (ADR 005). */
export default async function RegisterPage({ searchParams }: Props) {
  const t = await getT();
  const next = safeNext((await searchParams).next);
  if (await getSession()) redirect(next);

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">{t.register.title}</h1>
      <p className="mb-6 text-muted">{t.register.subtitle}</p>
      <RegisterForm next={next} />
    </>
  );
}
