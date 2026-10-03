import { signOut } from "@/app/actions/sign-out";
import { Button } from "@/components/ui/button";
import { de } from "@/lib/i18n/de";

export function SignOutButton() {
  return (
    <form action={signOut}>
      <Button type="submit" variant="ghost" size="sm">
        {de.common.signOut}
      </Button>
    </form>
  );
}
