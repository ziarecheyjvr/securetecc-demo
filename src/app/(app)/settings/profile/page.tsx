import { requireOrgContext } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileForm } from "@/components/app/profile-form";
import { getAvatarSignedUrl } from "@/lib/storage/avatars";
import { initialsOf } from "@/lib/initials";
import { buildGreeting, pacificAbbreviation } from "@/lib/greeting";

/**
 * Your own profile. Under /settings but not admin-gated, for the same reason
 * the Account page isn't: this is yours.
 */
export default async function ProfileSettingsPage() {
  const { appUser } = await requireOrgContext();
  const avatarUrl = await getAvatarSignedUrl(appUser.avatarPath);

  // Shown back to the user so the effect of setting a birthday is visible
  // immediately, rather than being a promise about some future morning.
  const preview = buildGreeting({
    firstName: appUser.name.split(" ")[0],
    birthMonth: appUser.birthMonth,
    birthDay: appUser.birthDay,
    organizationName: appUser.organization.name,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-muted-foreground">Your name, photo and birthday.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your details</CardTitle>
          <CardDescription>Shown in the sidebar, the header and on your dashboard.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            name={appUser.name}
            avatarUrl={avatarUrl}
            birthMonth={appUser.birthMonth}
            birthDay={appUser.birthDay}
            initials={initialsOf(appUser.name)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Your greeting right now</CardTitle>
          <CardDescription>
            Worked out in Pacific time ({pacificAbbreviation()}), so it follows your day rather than
            the server&apos;s — and it knows US holidays and your birthday.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border p-4">
            <p className="text-lg font-semibold">{preview.headline}</p>
            {preview.subline && (
              <p className="text-sm text-muted-foreground">{preview.subline}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
