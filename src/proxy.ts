import { DEMO_AUTH_COOKIE } from "@/lib/demo";
import { NextResponse, type NextRequest } from "next/server";

// Next.js 16 renamed `middleware.ts`/`middleware()` to `proxy.ts`/`proxy()`.
// This refreshes the Supabase session cookie on every request and gates the
// staff app behind auth. The public ticket-submission route and its API stay
// open (no login for clients, per spec).
//
// /api/cron is listed here because Vercel Cron invokes it with no user
// session -- redirecting it to /login would silently stop every scheduled job.
// It is NOT unprotected: those routes verify `Authorization: Bearer
// $CRON_SECRET` themselves and fail closed when the secret is unset
// (src/lib/cron/auth.ts).
// "/support" (a startsWith prefix match below) already covers "/support/status".
const PUBLIC_PATHS = ["/login", "/support", "/privacy", "/terms", "/api/tickets", "/api/cron", "/reset-password", "/api/demo-auth"];

// Client-facing ticket portal, on its own hostname rather than a path under
// the internal app. Clients never see a domain called "manage", and the
// public/staff split becomes structural instead of a path convention.
//
// support.securetecc.com stays on Hostinger as the marketing page and simply
// links here. Add that host to this array if it ever moves to Vercel too --
// the behaviour below is per-host, not per-domain.
const PUBLIC_TICKET_HOSTS = ["ticket.securetecc.com"];

// Pretty URLs on the ticket host: the public URL bar never shows /support.
const TICKET_REWRITES: Record<string, string> = {
  "/": "/support",
  "/status": "/support/status",
};

// Served as-is on the ticket host. /_next must be here or the page ships
// without its JS/CSS; the legal pages are linked from the portal footer.
const TICKET_PASSTHROUGH = ["/_next", "/support", "/privacy", "/terms"];

// Machine-to-machine routes, deliberately resolved BEFORE any host routing.
//
// The ticket-host branch below redirects everything it doesn't recognise to
// "/". Vercel Cron invokes whichever production domain Vercel picks, and for
// a while ticket.securetecc.com was the only custom domain attached -- so a
// cron hitting that host was being 307'd to the ticket form and silently
// doing nothing, on a schedule, with a 200 in the logs.
//
// manage.securetecc.com is now attached as well and needs no entry here:
// anything that is not a ticket host is served as the internal app, which is
// exactly what it should be.
//
// Safe to exempt from host routing because neither route relies on it for
// access control: /api/cron verifies `Authorization: Bearer $CRON_SECRET`
// and fails closed when the secret is unset (lib/cron/auth.ts), and
// /api/tickets is the public submission endpoint the portal is for.
const HOST_AGNOSTIC_PATHS = ["/api/cron", "/api/tickets"];

export async function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0];

  if (HOST_AGNOSTIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p))) {
    return NextResponse.next({ request });
  }

  if (host && PUBLIC_TICKET_HOSTS.includes(host)) {
    const { pathname } = request.nextUrl;

    const rewriteTo = TICKET_REWRITES[pathname];
    if (rewriteTo) {
      const url = request.nextUrl.clone();
      url.pathname = rewriteTo;
      // rewrite, not redirect: preserves method and body, so the form's
      // Server Action POST to "/" still reaches /support intact.
      return NextResponse.rewrite(url);
    }

    if (TICKET_PASSTHROUGH.some((prefix) => pathname.startsWith(prefix))) {
      return NextResponse.next({ request });
    }

    // Everything else on this host is internal-app surface. Send visitors to
    // the form rather than letting the staff app (or its login page) answer
    // on a client-facing domain at all.
    const home = request.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    return NextResponse.redirect(home);
  }

  const response = NextResponse.next({ request });

  // DEMO BUILD: the session is the demo cookie set by /api/demo-auth rather
  // than a Supabase auth cookie. lib/auth.ts still checks it resolves to a
  // real users row.
  const user = request.cookies.get(DEMO_AUTH_COOKIE)?.value ?? null;

  const isPublic = PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));

  if (!user && !isPublic) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // DEMO BUILD: no "already signed in" redirect off /login. A cookie left over
  // from a differently seeded database names a user that no longer exists, and
  // bouncing /login -> /dashboard -> /login would trap the browser in a loop.

  return response;
}

export const config = {
  // "monitoring" is Sentry's tunnel route (next.config.ts tunnelRoute). It has
  // to bypass this matcher entirely -- routed through the auth gate it would
  // be redirected to /login and no error would ever reach Sentry.
  matcher: ["/((?!monitoring|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
