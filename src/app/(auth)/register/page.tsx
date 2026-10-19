import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n/server";
import { getSession, safeNext } from "@/lib/session";
import { registrationEmailSchema } from "@/lib/validation/registration";
import { RegisterForm } from "./register-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).register.title };
}

type Props = { searchParams: Promise<{ next?: string | string[]; email?: string | string[] }> };

/** Registration with name, company address and password; the account follows the mailed link (ADR 005). */
export default async function RegisterPage({ searchParams }: Props) {
  const t = await getT();
  const params = await searchParams;
  const next = safeNext(params.next);
  if (await getSession()) redirect(next);
  // Prefilled from the "no account yet" mail or an invitation; only a valid address is taken over
  // (React escapes it as the field's value; the server action validates the submit again).
  const email = registrationEmailSchema.safeParse(Array.isArray(params.email) ? params.email[0] : params.email);

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">{t.register.title}</h1>
      <p className="mb-6 text-muted">{t.register.subtitle}</p>
      <RegisterForm next={next} email={email.success ? email.data : undefined} />
    </>
  );
}
