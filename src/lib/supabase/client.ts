// DEMO BUILD: browser-side stand-in for the Supabase client. Sign-in posts the
// email to /api/demo-auth, which sets the session cookie for a matching demo
// user; any password is accepted. Password changes and resets are no-ops.
type AuthError = { message: string } | null;

export function createClient() {
  return {
    auth: {
      async signInWithPassword({ email }: { email: string; password: string }): Promise<{ error: AuthError }> {
        const res = await fetch("/api/demo-auth", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email }),
        });
        if (res.ok) return { error: null };
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        return { error: { message: body?.error ?? "Sign-in failed" } };
      },
      async signOut(): Promise<{ error: AuthError }> {
        await fetch("/api/demo-auth", { method: "DELETE" });
        return { error: null };
      },
      async resetPasswordForEmail(_email: string, _opts?: { redirectTo?: string }): Promise<{ error: AuthError }> {
        return { error: null };
      },
      async updateUser(_attrs: { password?: string }): Promise<{ error: AuthError }> {
        return { error: null };
      },
      async getSession() {
        return { data: { session: {} as object | null }, error: null };
      },
      onAuthStateChange(_cb: (event: string, session: object | null) => void) {
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
  };
}
