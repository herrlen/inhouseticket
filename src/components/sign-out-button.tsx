import { signOut } from "@/app/actions/sign-out";
import { Button } from "@/components/ui/button";
import { getT } from "@/lib/i18n/server";

export async function SignOutButton() {
  const t = await getT();
  return (
    <form action={signOut}>
      <Button type="submit" variant="ghost" size="sm">
        {t.common.signOut}
      </Button>
    </form>
  );
}
