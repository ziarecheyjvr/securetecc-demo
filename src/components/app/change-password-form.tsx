"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MIN_LENGTH = 8;

/**
 * Password change for the signed-in user.
 *
 * Runs through the browser Supabase client rather than a server action: the
 * new password then goes straight from the form to Supabase over TLS and is
 * never handled by our own server, logged, or held in a server action's
 * arguments. Nothing here needs a session lookup we don't already have.
 */
export function ChangePasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = password.length >= MIN_LENGTH && password === confirm && !pending;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const { error } = await createClient().auth.updateUser({ password });
    setPending(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password changed.");
    setPassword("");
    setConfirm("");
  }

  return (
    <form onSubmit={submit} className="max-w-sm space-y-4">
      <div className="space-y-2">
        <Label htmlFor="new-password">New password</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {tooShort && (
          <p className="text-xs text-destructive">Use at least {MIN_LENGTH} characters.</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm-password">Confirm new password</Label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {mismatch && <p className="text-xs text-destructive">Passwords don&apos;t match.</p>}
      </div>

      <Button type="submit" disabled={!canSubmit}>
        {pending ? "Saving…" : "Change password"}
      </Button>
    </form>
  );
}
