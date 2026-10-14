"use client";

import { useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Builds the "leave us a review" link and copies it.
 *
 * This part needs no Google integration at all -- the write-review URL is
 * just a documented Google endpoint plus the Place ID -- so it ships working
 * now rather than waiting on the API work the rest of the page describes.
 *
 * The Place ID is kept in component state rather than the database on
 * purpose: persisting it means a schema change and a Settings field for one
 * string, and until the review-fetching work lands there is nothing else to
 * read it. Paste it once, copy the link, done. It moves to Settings when the
 * API side is built and something else needs it.
 */
export function ReviewLinkBuilder() {
  const [placeId, setPlaceId] = useState("");
  const trimmed = placeId.trim();
  const link = trimmed
    ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(trimmed)}`
    : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Review link copied");
    } catch {
      // Clipboard access can be refused (permissions, insecure context) --
      // say so rather than reporting a copy that didn't happen.
      toast.error("Couldn't copy — select the link and copy it manually.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="placeId">Google Place ID</Label>
        <Input
          id="placeId"
          value={placeId}
          onChange={(e) => setPlaceId(e.target.value)}
          placeholder="ChIJ..."
          autoComplete="off"
          spellCheck={false}
        />
        <p className="text-xs text-muted-foreground">
          Find it with Google&apos;s Place ID Finder, or from your Business Profile URL.
        </p>
      </div>

      {link && (
        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Share this link
          </p>
          {/* break-all: a Place ID is long and unbroken, and a link that
              overflows its card is worse than an ugly wrap. */}
          <p className="break-all font-mono text-xs">{link}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" onClick={copy}>
              <Copy className="h-4 w-4" />
              Copy link
            </Button>
            {/* buttonVariants on a plain anchor, the pattern already used
                for the dashboard's links -- an <a> that looks like a button
                rather than a button pretending to navigate. */}
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <ExternalLink className="h-4 w-4" />
              Test it
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
