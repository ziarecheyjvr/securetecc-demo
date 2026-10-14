import { CreditCard } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { ComingSoon } from "@/components/app/coming-soon";

/**
 * Planned: SecureTECC's own outgoings, as opposed to what clients are billed.
 *
 * Admin-gated because this is company cost data, which a technician has no
 * reason to see -- unlike RecurringCharge, which is what a CLIENT pays and is
 * visible to whoever is doing the billing.
 */
export default async function SubscriptionsPage() {
  const { appUser } = await requireAdminContext();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Subscriptions</h1>
        <p className="text-muted-foreground">
          What {appUser.organization.name} pays out each month.
        </p>
      </div>

      <ComingSoon
        icon={CreditCard}
        title="Coming soon"
        description="Track recurring software, services and vendor costs in one place."
        points={[
          "One row per subscription: vendor, what it's for, amount, billing cycle and renewal date.",
          "A monthly and annual total, so the real cost of running the business is a number rather than a guess.",
          "Renewal reminders ahead of the charge, while there's still time to cancel or renegotiate.",
          "Optionally attribute a cost to a client, so a licence bought for one account shows against its margin.",
        ]}
        note="Deliberately separate from Clients → Recurring charges. That tracks what a client PAYS; this tracks what SecureTECC SPENDS. Mixing the two is how a cost ends up on an invoice."
      />
    </div>
  );
}
