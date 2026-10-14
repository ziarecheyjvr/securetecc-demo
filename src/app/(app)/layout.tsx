import Image from "next/image";
import Link from "next/link";
import { requireAppUser } from "@/lib/auth";
import { getAvatarSignedUrl } from "@/lib/storage/avatars";
import { initialsOf } from "@/lib/initials";
import { AppSidebar } from "@/components/app/app-sidebar";
import { MobileNav } from "@/components/app/mobile-nav";
import { SignOutButton } from "@/components/app/sign-out-button";
import { PacificClock } from "@/components/app/pacific-clock";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const appUser = await requireAppUser();

  const initials = initialsOf(appUser.name);
  // Signed because the bucket is private; an hour's validity so it doesn't
  // expire mid-session and leave a broken image in the header.
  const avatarUrl = await getAvatarSignedUrl(appUser.avatarPath);

  return (
    <div className="flex min-h-screen">
      <AppSidebar role={appUser.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Teal rule under the header mirrors the brand treatment used on the
            public pages (/login, /support). The app shell uses the same dark
            navy/teal palette as those pages (globals.css's .dark tokens,
            applied on <body> in the root layout so portaled dialogs/selects
            pick it up too) rather than a light theme with a dark sidebar
            bolted on -- kept free of their splash/particle/glow motion, which
            doesn't belong in
            a data-dense daily-use tool. */}
        <header
          className="app-header relative flex h-16 shrink-0 items-center justify-between gap-3 px-4 sm:px-6"
        >
          {/* Left: the hamburger, and only on a phone. The desktop sidebar is
              always visible, so a menu button beside it would open a copy of
              something already on screen. The empty div keeps the header's
              right-hand cluster right-aligned on desktop. */}
          <div className="flex min-w-0 items-center gap-2">
            <MobileNav role={appUser.role} />
            {/* The sidebar carries the logo on desktop; on a phone the
                sidebar is gone, so the header is where the brand lives. */}
            <Image
              src="/securetecc-logo.png"
              alt="SecureTECC"
              width={1080}
              height={264}
              priority
              className="h-auto w-[132px] md:hidden"
            />
          </div>

          {/* No org name here -- the sidebar logo already identifies the
              brand, so repeating "SecureTECC" in the header was redundant. */}
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <PacificClock />
            {/* Hidden on a phone: the avatar already identifies who is
                signed in, and the name and role were the first things to
                crowd the sign-out button off the edge. */}
            <div className="hidden text-right text-sm sm:block">
              <p className="font-medium leading-none">{appUser.name}</p>
              <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--teal-ink)]">{appUser.role}</p>
            </div>
            {/* Links to the profile: the avatar is where people expect to
                click to change their own details. */}
            <Link href="/settings/profile" aria-label="Your profile">
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt=""
                  width={32}
                  height={32}
                  unoptimized
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-accent text-accent-foreground text-xs">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              )}
            </Link>
            <SignOutButton />
          </div>
        </header>
        {/* Transparent, not bg-secondary/30: the body's teal grid is the
            surface now, and a translucent slab over it just muddied it. */}
        {/* Tighter gutters on a phone: 24px each side of a 375px screen is
            13% of the width spent on nothing. */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
