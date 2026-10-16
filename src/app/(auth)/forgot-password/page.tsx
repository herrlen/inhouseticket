import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
import { ForgotPasswordForm } from "./forgot-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).password.forgotTitle };
}

export default async function ForgotPasswordPage() {
  const t = await getT();
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">{t.password.forgotTitle}</h1>
      <p className="mb-6 text-muted">{t.password.forgotIntro}</p>
      <ForgotPasswordForm />
    </>
  );
}
