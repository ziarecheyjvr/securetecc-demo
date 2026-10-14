import { Star } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ComingSoon } from "@/components/app/coming-soon";
import { ReviewLinkBuilder } from "@/components/app/review-link-builder";

/**
 * Google Business Profile.
 *
 * Split deliberately: the review link needs no integration and works today,
 * so it ships as a working tool rather than being held back behind the API
 * work described underneath it.
 */
export default async function ReviewsPage() {
  const { appUser } = await requireAdminContext();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reviews</h1>
        <p className="text-muted-foreground">
          Google Business Profile for {appUser.organization.name}.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Ask for a review</CardTitle>
          <CardDescription>
            A link that opens Google&apos;s review box directly, with the star rating ready — no
            searching for the business first. Paste it into an email after closing a ticket.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReviewLinkBuilder />
        </CardContent>
      </Card>

      <ComingSoon
        icon={Star}
        title="Coming soon"
        description="Your Google reviews, pulled in and answerable from here."
        points={[
          "Every review with its rating, author and date, newest first.",
          "Current average and total count, and how both have moved over time.",
          "An alert when a review lands — particularly a low one, where responding quickly matters most.",
          "Reply to a review without leaving the platform.",
        ]}
        note="Needs the Google Business Profile API, which requires a separate access request to Google and approval of the SecureTECC business account — a longer lead time than the Drive and Gmail setup, so the review link above stands on its own in the meantime."
      />
    </div>
  );
}
