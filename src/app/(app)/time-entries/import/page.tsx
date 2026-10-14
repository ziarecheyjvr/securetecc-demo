import Link from "next/link";
import { Button } from "@/components/ui/button";
import { TimeEntryCsvImport } from "@/components/app/time-entry-csv-import";

export default function TimeEntryImportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Import time entries</h1>
        <p className="text-muted-foreground">
          Upload a CSV to bulk-create time entries. Nothing is written until you confirm.
        </p>
      </div>

      <TimeEntryCsvImport />

      <div>
        <Button variant="ghost" render={<Link href="/time-entries" />}>
          ← Back to time entries
        </Button>
      </div>
    </div>
  );
}
