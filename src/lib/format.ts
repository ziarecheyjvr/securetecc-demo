const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

export function formatHours(value: number): string {
  // Hours are stored as Decimal(5,2); trim a trailing ".00" but keep ".25"/".5".
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, "");
}

export function formatDate(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

/**
 * Combines the two address lines onto one line.
 *
 * The proven Sheets system requires no stray comma or blank segment when
 * address2 is empty -- filtering before joining is the whole point here; a
 * naive `${address1}, ${address2}` template leaves a dangling ", ".
 */
export function formatAddressLine(
  address1: string | null | undefined,
  address2: string | null | undefined,
): string {
  return [address1, address2]
    .filter((line): line is string => Boolean(line && line.trim().length > 0))
    .map((line) => line.trim())
    .join(", ");
}
