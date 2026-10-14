import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/app/reset-password-form";

export const metadata: Metadata = { title: "Set a new password — SecureTECC" };

/**
 * Landing page for the Supabase recovery link.
 *
 * Public (listed in proxy.ts): whoever follows the link is by definition not
 * signed in yet. Supabase puts a recovery session in place from the URL
 * fragment, which the client component below then uses to set the password.
 */
export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050F1D] px-6 font-[family-name:var(--font-poppins)] text-white">
      <div className="w-full max-w-md rounded-[14px] border border-[rgba(6,225,220,0.24)] bg-[#071E37] p-8">
        <h1 className="mb-2 text-2xl font-bold">Set a new password</h1>
        <p className="mb-6 text-[15px] text-[rgba(255,255,255,0.74)]">
          Choose a new password for your SecureTECC account.
        </p>
        <ResetPasswordForm />
      </div>
    </div>
  );
}
