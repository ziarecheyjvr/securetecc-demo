/**
 * Two-letter initials for an avatar fallback.
 *
 * Extracted because the app shell, the profile page and anywhere else showing
 * a face all need the same answer -- three separate inlined versions is how
 * one of them ends up rendering three letters.
 */
export function initialsOf(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
