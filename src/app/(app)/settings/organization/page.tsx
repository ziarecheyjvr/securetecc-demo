import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  EmailDomainChecklist,
  OrganizationForm,
  StaffSection,
} from "@/components/app/organization-form";

export default async function OrganizationSettingsPage() {
  const {
    appUser,
    data: [organization, staff],
  } = await requireOrgContext(async (tx, user) => [
    await tx.organization.findUniqueOrThrow({ where: { id: user.organizationId } }),
    await tx.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        receivesTicketEmails: true,
        notifyTaskAssigned: true,
        notifyTaskForReview: true,
        notifyTaskCompleted: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);
  if (appUser.role !== "admin") redirect("/dashboard?error=admin-only");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Organization</h1>
        <p className="text-muted-foreground">
          Branding, sender addresses, email verification, and staff access.
        </p>
      </div>

      <OrganizationForm
        defaultValues={{
          name: organization.name,
          supportEmail: organization.supportEmail,
          notificationFromEmail: organization.notificationFromEmail ?? "",
          ticketNotificationEmail: organization.ticketNotificationEmail ?? "",
          invoiceFromEmail: organization.invoiceFromEmail ?? "",
          phone: organization.phone ?? "",
          logoUrl: organization.logoUrl ?? "",
          brandColorPrimary: organization.brandColorPrimary,
          brandColorAccent: organization.brandColorAccent,
      monthlyRevenueGoal: Number(organization.monthlyRevenueGoal),
          billerName: organization.billerName ?? "",
          billerAddress1: organization.billerAddress1 ?? "",
          billerAddress2: organization.billerAddress2 ?? "",
          billerCityStateZip: organization.billerCityStateZip ?? "",
          billerMobilePhone: organization.billerMobilePhone ?? "",
          billerEmail: organization.billerEmail ?? "",
          website: organization.website ?? "",
          invoiceForLabel: organization.invoiceForLabel ?? "",
          checkPayableTo: organization.checkPayableTo ?? "",
          acceptedPaymentMethods: organization.acceptedPaymentMethods ?? "",
        }}
      />

      <EmailDomainChecklist
        verified={organization.emailDomainVerified}
        notificationFromEmail={organization.notificationFromEmail ?? organization.supportEmail}
      />

      <StaffSection staff={staff} currentUserId={appUser.id} />

      <div>
        <Button variant="ghost" render={<Link href="/settings" />}>
          ← Back to settings
        </Button>
      </div>
    </div>
  );
}
