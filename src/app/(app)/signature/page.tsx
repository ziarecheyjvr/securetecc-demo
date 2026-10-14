import { requireOrgContext } from "@/lib/auth";
import { withRLS } from "@/lib/db/rls";
import { SignatureGenerator } from "@/components/app/signature-generator";

/**
 * Email-signature generator.
 *
 * Name and email are prefilled from the signed-in user, since in practice
 * everyone generates their own — but both stay editable, because someone
 * setting up a signature for a new hire before their account exists is a real
 * case and forcing a login switch for it would be silly.
 */
export default async function SignaturePage() {
  const { appUser, authUserId } = await requireOrgContext();
  const savedSignatures = await withRLS(authUserId, (tx) =>
    tx.emailSignature.findMany({
      where: { ownerUserId: appUser.id },
      select: { id: true, name: true, html: true, isDefault: true },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    }),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Signature</h1>
        <p className="text-muted-foreground">
          Build your SecureTECC email signature and paste it straight into Gmail or Outlook.
        </p>
      </div>

      <SignatureGenerator
        defaultName={appUser.name}
        defaultEmail={appUser.email}
        savedSignatures={savedSignatures}
      />
    </div>
  );
}
