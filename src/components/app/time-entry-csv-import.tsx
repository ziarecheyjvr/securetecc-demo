"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  previewTimeEntryImport,
  commitTimeEntryImport,
  type PreviewRow,
} from "@/app/(app)/time-entries/import-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Upload -> preview -> confirm, mirroring the two-step shape of
 * invoice-generation-flow.tsx. The preview step writes nothing; only
 * "Import N valid rows" commits, and it only ever sends the already-resolved
 * valid subset -- invalid rows are never part of the payload.
 */
export function TimeEntryCsvImport() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [rows, setRows] = useState<PreviewRow[] | null>(null);

  async function handlePreview(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      toast.error("Choose a CSV file first.");
      return;
    }
    setPreviewing(true);
    setRows(null);
    const formData = new FormData();
    formData.set("file", file);
    const result = await previewTimeEntryImport(formData);
    setPreviewing(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setRows(result.rows);
  }

  async function handleImport() {
    const validRows = (rows ?? []).filter((r) => r.resolved !== null).map((r) => r.resolved!);
    if (validRows.length === 0) return;

    setImporting(true);
    const result = await commitTimeEntryImport(validRows);
    setImporting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Imported ${result.created} time ${result.created === 1 ? "entry" : "entries"}`);
    router.push("/time-entries");
  }

  const validCount = rows?.filter((r) => r.resolved !== null).length ?? 0;
  const invalidCount = (rows?.length ?? 0) - validCount;

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <form onSubmit={handlePreview} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="csvFile" className="text-sm font-medium">
              CSV file
            </label>
            <input
              id="csvFile"
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground"
            />
            <p className="text-xs text-muted-foreground">
              Columns: clientShortName, date, durationHours, description, serviceTypeCode, and
              optionally billableStatus (defaults to Billable).
            </p>
          </div>
          <Button type="submit" disabled={previewing}>
            {previewing ? "Reading…" : "Preview"}
          </Button>
        </form>
      </Card>

      {rows && (
        <>
          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm">
                <span className="font-medium text-foreground">{validCount}</span> valid
                {invalidCount > 0 && (
                  <>
                    {" · "}
                    <span className="font-medium text-destructive">{invalidCount}</span> with
                    errors
                  </>
                )}
                {" of "}
                {rows.length} rows
              </p>
              <Button onClick={handleImport} disabled={importing || validCount === 0}>
                {importing ? "Importing…" : `Import ${validCount} valid ${validCount === 1 ? "row" : "rows"}`}
              </Button>
            </div>
          </Card>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Row</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Service type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.rowNumber} data-invalid={row.error !== null || undefined}>
                    <TableCell className="text-muted-foreground">{row.rowNumber}</TableCell>
                    <TableCell>{row.raw.clientshortname}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {row.resolved?.date ?? row.raw.date}
                    </TableCell>
                    <TableCell>{row.resolved?.durationHours ?? row.raw.durationhours}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.raw.servicetypecode}
                    </TableCell>
                    <TableCell className="max-w-xs truncate" title={row.raw.description}>
                      {row.raw.description}
                    </TableCell>
                    <TableCell>
                      {row.error ? (
                        <Badge variant="destructive" title={row.error}>
                          {row.error}
                        </Badge>
                      ) : (
                        <Badge variant="default">Ready</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
