import type { ExpenseFrequency } from "@/generated/prisma/enums";

/**
 * Revenue against cost.
 *
 * Two figures are kept apart on purpose:
 *
 *  - DIRECT costs, attached to a client. Those are the ones that can honestly
 *    be set against what that client was billed.
 *  - OVERHEAD, attached to nobody. It is reported at the business level and
 *    NOT divided across clients: any split would be invented, and an invented
 *    split produces a per-client profit that looks precise and is not.
 *
 * So a client row answers "what does serving this client cost us against what
 * we bill them", and the business row answers "what is left after everything".
 */
export type ExpenseLike = {
  amount: number;
  frequency: ExpenseFrequency;
  clientId: string | null;
  startDate: Date | null;
  endDate: Date | null;
  activeStatus: boolean;
};

/**
 * What a recurring cost amounts to across a window.
 *
 * A monthly cost is charged once per calendar month the window touches; an
 * annual one is spread evenly, because a $1,200 annual licence is $100 of
 * cost in any given month whatever month the invoice lands in. A one-off
 * counts only if its date falls inside the window.
 */
export function expenseInRange(
  expense: ExpenseLike,
  start: Date,
  end: Date,
  monthsInRange: number,
): number {
  if (!expense.activeStatus && expense.frequency !== "OneOff") return 0;
  // Outside its own lifetime contributes nothing.
  if (expense.startDate && expense.startDate >= end) return 0;
  if (expense.endDate && expense.endDate < start) return 0;

  switch (expense.frequency) {
    case "Monthly":
      return expense.amount * monthsInRange;
    case "Annual":
      return (expense.amount / 12) * monthsInRange;
    case "OneOff":
      return expense.startDate && expense.startDate >= start && expense.startDate < end
        ? expense.amount
        : 0;
  }
}

export type ProfitabilityRow = {
  clientId: string;
  name: string;
  invoiced: number;
  directCost: number;
  margin: number;
  /** margin / invoiced, or null when nothing was invoiced. */
  marginRatio: number | null;
};

export type ProfitabilitySummary = {
  clients: ProfitabilityRow[];
  revenue: number;
  directCosts: number;
  overhead: number;
  /** revenue - (direct + overhead). */
  netProfit: number;
  monthsInRange: number;
};

export function buildProfitability(args: {
  invoicedByClient: Map<string, { name: string; amount: number }>;
  expenses: ExpenseLike[];
  clientNames: Map<string, string>;
  start: Date;
  end: Date;
  monthsInRange: number;
}): ProfitabilitySummary {
  const { invoicedByClient, expenses, clientNames, start, end, monthsInRange } = args;

  const directByClient = new Map<string, number>();
  let overhead = 0;

  for (const e of expenses) {
    const value = expenseInRange(e, start, end, monthsInRange);
    if (value === 0) continue;
    if (e.clientId) directByClient.set(e.clientId, (directByClient.get(e.clientId) ?? 0) + value);
    else overhead += value;
  }

  const ids = new Set<string>([...invoicedByClient.keys(), ...directByClient.keys()]);
  const round = (n: number) => Math.round(n * 100) / 100;

  const clients: ProfitabilityRow[] = [...ids]
    .map((id) => {
      const invoiced = invoicedByClient.get(id)?.amount ?? 0;
      const directCost = directByClient.get(id) ?? 0;
      return {
        clientId: id,
        name: invoicedByClient.get(id)?.name ?? clientNames.get(id) ?? "Unknown client",
        invoiced: round(invoiced),
        directCost: round(directCost),
        margin: round(invoiced - directCost),
        marginRatio: invoiced > 0 ? (invoiced - directCost) / invoiced : null,
      };
    })
    // Thinnest margin first: the question this answers is "am I charging
    // enough", and the answer lives at the top of that order.
    .sort((a, b) => a.margin - b.margin);

  const revenue = [...invoicedByClient.values()].reduce((s, r) => s + r.amount, 0);
  const directCosts = [...directByClient.values()].reduce((s, v) => s + v, 0);

  return {
    clients,
    revenue: round(revenue),
    directCosts: round(directCosts),
    overhead: round(overhead),
    netProfit: round(revenue - directCosts - overhead),
    monthsInRange,
  };
}
