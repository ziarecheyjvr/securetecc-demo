import { requireOrgContext } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangePasswordForm } from "@/components/app/change-password-form";

/**
 * Personal account settings.
 *
 * Under /settings but deliberately NOT admin-gated like the rest of it: your
 * own password is yours to change, and requiring an admin to do it is how you
 * end up with passwords being passed around in chat.
 */
export default async function AccountSettingsPage() {
  const { appUser } = await requireOrgContext();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="text-muted-foreground">Your sign-in details.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change password</CardTitle>
          <CardDescription>Signed in as {appUser.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
