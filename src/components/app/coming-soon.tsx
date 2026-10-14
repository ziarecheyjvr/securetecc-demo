import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Shared shell for a planned-but-unbuilt section.
 *
 * Real pages rather than disabled nav links: a link that goes nowhere reads
 * as broken, whereas a page that says what's coming reads as planned. Same
 * shape as the existing /signature placeholder so the whole set looks
 * deliberate rather than like three different stubs.
 *
 * `points` is what the section will actually do, in the order it would be
 * built. Vague placeholders age badly -- being specific here means the page
 * doubles as the spec when the work starts.
 */
export function ComingSoon({
  icon: Icon,
  title,
  description,
  points,
  note,
  preview,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  points: string[];
  note?: string;
  /**
   * A rough sketch of the layout this page will have. A list of features
   * tells you what a page does; a shape tells you what it will look like,
   * and the two answer different questions when you are deciding whether
   * it is what you asked for.
   */
  preview?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3 space-y-0">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/15">
          <Icon className="h-5 w-5 text-accent" />
        </span>
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2">
          {points.map((point) => (
            <li key={point} className="flex gap-2.5 text-sm text-muted-foreground">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent/60" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
        {preview && (
          <div className="space-y-2 border-t pt-4">
            <p className="label-hud opacity-70">Roughly what you&apos;ll see</p>
            <div aria-hidden className="select-none">
              {preview}
            </div>
          </div>
        )}
        {note && <p className="border-t pt-4 text-sm text-muted-foreground">{note}</p>}
      </CardContent>
    </Card>
  );
}
