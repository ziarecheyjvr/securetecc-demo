import type { LeadSource } from "@/generated/prisma/enums";

/** Labels for "How did you hear about us?", answered at client intake. */
export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  Website: "Website",
  GoogleBusinessProfile: "Google Business Profile",
  SEO: "SEO",
  Campaign: "Campaign",
  Referral: "Referral — owner's network",
  ExistingClient: "Referred by an existing client",
  ReturningClient: "Returning after a gap",
  Legacy: "Legacy client — was already here",
  Other: "Other",
};
