"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const MIN_LENGTH = 8;
const FIELD =
  "w-full rounded-[10px] border border-[rgba(6,225,220,0.24)] bg-[rgba(6,225,220,0.05)] px-4 py-[13px] text-[15px] text-white outline-none transition-colors placeholder:text-[rgba(255,255,255,0.35)] focus:border-[#06E1DC]";

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Supabase exchanges the URL fragment for a recovery session asynchronously.
  // Until that lands there's no session to update, so the form stays disabled
  // rather than failing with a confusing "Auth session missing".
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => setReady(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) =>
      setReady(!!session),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const { error } = await createClient().auth.updateUser({ password });
    setPending(false);

    if (error) {
      setError(error.message);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  const canSubmit = ready && password.length >= MIN_LENGTH && password === confirm && !pending;

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="pw" className="mb-2 block text-xs font-bold uppercase tracking-[1.5px] text-[#06E1DC]">
          New password
        </label>
        <input
          id="pw"
          type="password"
          autoComplete="new-password"
          className={FIELD}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <div>
        <label htmlFor="pw2" className="mb-2 block text-xs font-bold uppercase tracking-[1.5px] text-[#06E1DC]">
          Confirm password
        </label>
        <input
          id="pw2"
          type="password"
          autoComplete="new-password"
          className={FIELD}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>

      {password.length > 0 && password.length < MIN_LENGTH && (
        <p className="text-sm text-[#ff8a8a]">Use at least {MIN_LENGTH} characters.</p>
      )}
      {confirm.length > 0 && password !== confirm && (
        <p className="text-sm text-[#ff8a8a]">Passwords don&apos;t match.</p>
      )}
      {error && <p role="alert" className="text-sm text-[#ff8a8a]">{error}</p>}
      {!ready && (
        <p className="text-sm text-[rgba(255,255,255,0.55)]">
          Waiting for the reset link to be verified…
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-[10px] bg-[#06E1DC] px-10 py-[15px] text-base font-bold text-[#071E37] transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-[#1a3050] disabled:text-[rgba(255,255,255,0.3)]"
      >
        {pending ? "Saving…" : "Set password"}
      </button>
    </form>
  );
}
