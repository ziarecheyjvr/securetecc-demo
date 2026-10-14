"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  loadBillingCandidates,
  generateInvoice,
  type BillingCandidates,
} from "@/app/(app)/invoices/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDate, formatHours } from "@/lib/format";

type ClientOption = { id: string; name: string };

type Preset = "this-month" | "last-month" | "past-3" | "past-6" | "past-12" | "custom";

const PRESET_LABELS: Record<Preset, string> = {
  "this-month": "This month",
  "last-month": "Last month",
  "past-3": "Past 3 months",
  "past-6": "Past 6 months",
  "past-12": "Past 12 months",
  custom: "Custom range",
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Resolves a preset (or the custom start/end pair) to a concrete
 * [periodStart, periodEnd] range, in UTC. "Past N months" means the N most
 * recently *completed* calendar months -- not including the current,
 * still-open one -- matching how "last month's invoice" is normally meant.
 */
function resolvePeriod(
  preset: Preset,
  customStart: string,
  customEnd: string,
): { periodStart: string; periodEnd: string } | null {
  if (preset === "custom") {
    if (!customStart || !customEnd) return null;
    return { periodStart: customStart, periodEnd: customEnd };
  }

  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const spans: Record<Exclude<Preset, "custom">, [number, number]> = {
    "this-month": [0, 0],
    "last-month": [1, 1],
    "past-3": [3, 1],
    "past-6": [6, 1],
    "past-12": [12, 1],
  };
  const [monthsAgoStart, monthsAgoEnd] = spans[preset];
  const periodStart = new Date(Date.UTC(y, m - monthsAgoStart, 1));
  const periodEnd = new Date(Date.UTC(y, m - monthsAgoEnd + 1, 0));
  return { periodStart: isoDate(periodStart), periodEnd: isoDate(periodEnd) };
}

/**
 * Two-step flow, mirroring the input -> review shape of
 * ai-time-entry-dialog.tsx but as a full page (the review table is far too
 * much content for a dialog).
 *
 * The review step is include/exclude only -- amounts aren't editable here on
 * purpose. Line-item numbers come from the TimeEntry/RecurringCharge records,
 * which stay the single source of truth; correcting an entry happens on the
 * Time Entries screen. The server re-derives every amount at generation time
 * regardless of what this screen submits.
 */
export function InvoiceGenerationFlow({ clients }: { clients: ClientOption[] }) {
  const router = useRouter();

  const [step, setStep] = useState<"select" | "review">("select");
  const [clientId, setClientId] = useState("");
  const [preset, setPreset] = useState<Preset>("last-month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [includeNonBillable, setIncludeNonBillable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [candidates, setCandidates] = useState<BillingCandidates | null>(null);
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());
  const [selectedCharges, setSelectedCharges] = useState<Set<string>>(new Set());
  const [selectedExpenses, setSelectedExpenses] = useState<Set<string>>(new Set());

  async function handleLoad() {
    if (!clientId) {
      toast.error("Select a client first.");
      return;
    }
    const period = resolvePeriod(preset, customStart, customEnd);
    if (!period) {
      toast.error("Pick a start and end date.");
      return;
    }
    setLoading(true);
    const result = await loadBillingCandidates({ clientId, ...period, includeNonBillable });
    setLoading(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    const data = result.data;
    if (
      data.timeEntries.length === 0 &&
      data.recurringCharges.length === 0 &&
      data.reimbursableExpenses.length === 0
    ) {
      toast.error("Nothing unbilled for that client and period.");
      return;
    }

    setCandidates(data);
    // Everything starts checked; unchecking is how you hold something back.
    // Entries with no resolvable rate start unchecked -- generation refuses
    // them, so pre-selecting would just guarantee an error.
    const unrated = new Set(data.unratedEntryIds);
    setSelectedEntries(
      new Set(data.timeEntries.filter((e) => !unrated.has(e.id)).map((e) => e.id)),
    );
    setSelectedCharges(new Set(data.recurringCharges.map((c) => c.id)));
    setSelectedExpenses(new Set(data.reimbursableExpenses.map((e) => e.id)));
    setStep("review");
  }

  async function handleGenerate() {
    const period = resolvePeriod(preset, customStart, customEnd);
    if (!period || !candidates) return;
    setSubmitting(true);
    const result = await generateInvoice({
      clientId,
      ...period,
      includeNonBillable,
      timeEntryIds: [...selectedEntries],
      recurringChargeOccurrenceIds: [...selectedCharges],
      reimbursableExpenseIds: [...selectedExpenses],
    });
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    if (result.data.pdfFailed) {
      toast.warning(
        `Invoice ${result.data.invoiceNumber} created, but the PDF failed to render. ` +
          "Use Retry PDF on the invoice.",
      );
    } else if (result.data.archiveWarning) {
      // The invoice itself is fine -- only the Drive copy didn't land.
      toast.warning(
        `Invoice ${result.data.invoiceNumber} created, but archiving to Google Drive failed: ` +
          result.data.archiveWarning,
      );
    } else {
      toast.success(`Invoice ${result.data.invoiceNumber} created as Draft`);
    }
    router.push(`/invoices/${result.data.invoiceId}`);
  }

  function toggle(set: Set<string>, id: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  }

  // Rows the server will refuse: hourly, billable, and no rate resolvable.
  // A no-charge row also has no rate, but that is the point of it.
  const unratedIds = new Set(candidates?.unratedEntryIds ?? []);
  const selectableEntryIds =
    candidates?.timeEntries.filter((e) => !unratedIds.has(e.id)).map((e) => e.id) ?? [];

  // Running total reflects only what's checked, recomputed from the values the
  // server already sent. The server recomputes independently on submit.
  const selectedEntryRows =
    candidates?.timeEntries.filter((e) => selectedEntries.has(e.id)) ?? [];
  const selectedChargeRows =
    candidates?.recurringCharges.filter((c) => selectedCharges.has(c.id)) ?? [];
  const selectedExpenseRows =
    candidates?.reimbursableExpenses.filter((e) => selectedExpenses.has(e.id)) ?? [];
  const noChargeRows = selectedEntryRows.filter((e) => e.billableStatus !== "Billable");
  const runningHours = selectedEntryRows.reduce((s, e) => s + e.hours, 0);
  const runningTotal =
    selectedEntryRows.reduce((s, e) => s + (e.amount ?? 0), 0) +
    selectedChargeRows.reduce((s, c) => s + c.amount, 0) +
    selectedExpenseRows.reduce((s, e) => s + e.amount, 0);

  if (step === "select") {
    return (
      <Card className="max-w-xl p-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="client">Client</Label>
            <Select value={clientId} onValueChange={(v) => setClientId(v ?? "")}>
              <SelectTrigger id="client">
                {/* base-ui renders the raw value (a uuid here) without this mapper */}
                <SelectValue placeholder="Select client">
                  {(value) =>
                    clients.find((c) => c.id === value)?.name ?? "Select client"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="period">Billing period</Label>
            <Select value={preset} onValueChange={(v) => setPreset((v ?? "last-month") as Preset)}>
              <SelectTrigger id="period">
                <SelectValue>{(value) => PRESET_LABELS[value as Preset]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PRESET_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              A Monthly recurring charge bills once per calendar month the period touches; an
              Annual charge bills once per January it touches.
            </p>
          </div>

          {preset === "custom" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="customStart">Start date</Label>
                <Input
                  id="customStart"
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customEnd">End date</Label>
                <Input
                  id="customEnd"
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="flex items-start gap-3 rounded-md border p-3">
            <Checkbox
              id="includeNonBillable"
              checked={includeNonBillable}
              onCheckedChange={(v) => setIncludeNonBillable(v === true)}
            />
            <div className="space-y-1">
              <Label htmlFor="includeNonBillable">Include no-charge time entries</Label>
              <p className="text-xs text-muted-foreground">
                Lists the period&apos;s Non-Billable and Residual work on the invoice with its
                hours and &ldquo;No charge&rdquo; in place of a rate. Nothing is added to the
                total.
              </p>
            </div>
          </div>

          <Button onClick={handleLoad} disabled={loading} className="w-full">
            {loading ? "Loading…" : "Load billable items"}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium">{candidates?.clientName}</p>
            <p className="text-sm text-muted-foreground">
              {candidates && `${formatDate(candidates.periodStart)} – ${formatDate(candidates.periodEnd)}`}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">
              {formatHours(runningHours)} hrs · {selectedEntryRows.length} entries
              {noChargeRows.length > 0 && ` (${noChargeRows.length} no charge)`} ·{" "}
              {selectedChargeRows.length} charges · {selectedExpenseRows.length} expenses
            </p>
            <p className="text-xl font-semibold">{formatCurrency(runningTotal)}</p>
          </div>
        </div>
      </Card>

      {candidates && candidates.unratedEntryIds.length > 0 && (
        <Card className="border-destructive/50 p-4">
          <p className="text-sm text-destructive">
            {candidates.unratedEntryIds.length} entr
            {candidates.unratedEntryIds.length === 1 ? "y has" : "ies have"} no resolvable rate
            (no service-type override and no client billing rate). They can&apos;t be invoiced
            until a rate is set.
          </p>
        </Card>
      )}

      {candidates && candidates.timeEntries.length > 0 && (
        <Card>
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="font-medium">Time entries</h2>
            <button
              type="button"
              className="text-sm text-muted-foreground underline"
              onClick={() =>
                setSelectedEntries(
                  selectedEntries.size === selectableEntryIds.length
                    ? new Set()
                    : new Set(selectableEntryIds),
                )
              }
            >
              Toggle all
            </button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.timeEntries.map((entry) => (
                <TableRow key={entry.id} data-unrated={unratedIds.has(entry.id) || undefined}>
                  <TableCell>
                    <Checkbox
                      checked={selectedEntries.has(entry.id)}
                      disabled={unratedIds.has(entry.id)}
                      onCheckedChange={() =>
                        toggle(selectedEntries, entry.id, setSelectedEntries)
                      }
                      aria-label={`Include entry from ${formatDate(entry.date)}`}
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(entry.date)}</TableCell>
                  <TableCell className="max-w-md truncate">
                    {entry.description}
                    {entry.billableStatus !== "Billable" && (
                      <span className="ml-2 rounded border px-1.5 py-0.5 text-xs text-muted-foreground">
                        {entry.billableStatus === "Residual" ? "Residual" : "Non-billable"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{entry.serviceTypeCode}</TableCell>
                  <TableCell className="text-right">{formatHours(entry.hours)}</TableCell>
                  <TableCell className="text-right">
                    {entry.billableStatus !== "Billable"
                      ? "No charge"
                      : entry.rate === null
                        ? "—"
                        : formatCurrency(entry.rate)}
                  </TableCell>
                  <TableCell className="text-right">
                    {entry.amount === null ? "—" : formatCurrency(entry.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {candidates && candidates.recurringCharges.length > 0 && (
        <Card>
          <div className="border-b px-4 py-3">
            <h2 className="font-medium">Recurring charges</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Description</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.recurringCharges.map((charge) => (
                <TableRow key={charge.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedCharges.has(charge.id)}
                      onCheckedChange={() =>
                        toggle(selectedCharges, charge.id, setSelectedCharges)
                      }
                      aria-label={`Include ${charge.description}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{charge.description}</TableCell>
                  <TableCell>
                    {charge.billingFrequency === "Annual" ? "Annual (January)" : "Monthly"}
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(charge.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {candidates && candidates.reimbursableExpenses.length > 0 && (
        <Card>
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="font-medium">Reimbursable expenses</h2>
            <button
              type="button"
              className="text-sm text-muted-foreground underline"
              onClick={() =>
                setSelectedExpenses(
                  selectedExpenses.size === candidates.reimbursableExpenses.length
                    ? new Set()
                    : new Set(candidates.reimbursableExpenses.map((e) => e.id)),
                )
              }
            >
              Toggle all
            </button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.reimbursableExpenses.map((expense) => (
                <TableRow key={expense.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedExpenses.has(expense.id)}
                      onCheckedChange={() =>
                        toggle(selectedExpenses, expense.id, setSelectedExpenses)
                      }
                      aria-label={`Include ${expense.description}`}
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(expense.date)}</TableCell>
                  <TableCell className="max-w-md truncate">{expense.description}</TableCell>
                  <TableCell className="text-right">{formatCurrency(expense.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => setStep("select")} disabled={submitting}>
          Back
        </Button>
        <Button
          onClick={handleGenerate}
          disabled={
            submitting ||
            (selectedEntries.size === 0 && selectedCharges.size === 0 && selectedExpenses.size === 0)
          }
        >
          {submitting ? "Generating…" : "Generate draft invoice"}
        </Button>
      </div>
    </div>
  );
}
