import { BookLock } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { ComingSoon } from "@/components/app/coming-soon";

/**
 * Planned: per-client technical documentation and credentials.
 *
 * Flagged deliberately in `note` below -- credential storage is the one
 * feature here that is dangerous to build casually, and the design decision
 * belongs in front of whoever reads this page, not buried in a ticket.
 */
export default async function DocumentationPage() {
  await requireAdminContext();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Documentation</h1>
        <p className="text-muted-foreground">
          Network notes and credentials, per client.
        </p>
      </div>

      <ComingSoon
        icon={BookLock}
        title="Coming soon"
        description="The details currently living in time-entry descriptions, kept where they belong."
        points={[
          "Per-client notes: network layout, VLANs, router and firewall config, ISP and account numbers.",
          "Credentials stored encrypted, revealed one at a time and copied without ever displaying in full.",
          "Key contacts and after-hours escalation, so cover doesn't depend on one person's memory.",
          "An access log — who revealed which credential and when, which is what makes shared credentials defensible.",
        ]}
        note="Credentials need encryption at rest with a key held outside the database, so a database dump alone discloses nothing. That is a design decision to make before building, not after — which is why this is a placeholder rather than a quick first version."
      />
    </div>
  );
}
