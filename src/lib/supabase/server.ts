import { cookies } from "next/headers";
import { DEMO_AUTH_COOKIE } from "@/lib/demo";

// DEMO BUILD: no Supabase. The "session" is a cookie holding the demo user's
// authUserId, set by /api/demo-auth. lib/auth.ts still resolves it to a
// public.users row and redirects to /login when there isn't one, exactly as
// it did with a real Supabase session.
export async function createClient() {
  const cookieStore = await cookies();

  return {
    auth: {
      async getUser() {
        const id = cookieStore.get(DEMO_AUTH_COOKIE)?.value;
        return { data: { user: id ? { id } : null }, error: null };
      },
    },
  };
}
