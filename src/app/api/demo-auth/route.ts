import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { DEMO_AUTH_COOKIE } from "@/lib/demo";

// DEMO BUILD: signs in as whichever demo user owns the email. No password
// check -- every account here is fictional.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = body?.email?.trim();
  if (!email) return NextResponse.json({ error: "Enter an email address." }, { status: 400 });

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { authUserId: true },
  });
  if (!user) {
    return NextResponse.json(
      { error: "No demo account uses that email. The login screen lists the demo accounts." },
      { status: 401 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(DEMO_AUTH_COOKIE, user.authUserId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(DEMO_AUTH_COOKIE);
  return response;
}
