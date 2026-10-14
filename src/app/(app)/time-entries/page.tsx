import Link from "next/link";
import { requireOrgContext } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TimeEntryDialog } from "@/components/app/time-entry-dialog";
import { DeleteTimeEntryButton } from "@/components/app/delete-time-entry-button";
import { VoiceLoggerDialog } from "@/components/app/voice-logger-dialog";
import { AiTimeEntryDialog } from "@/components/app/ai-time-entry-dialog";
import { TimeEntriesTabs } from "@/components/app/time-entries-tabs";
import { TimeEntryFilters } from "@/components/app/time-entry-filters";
import { BILLABLE_STATUS_LABELS } from "@/lib/validations/time-entry";
import { formatCurrency } from "@/lib/format";
import { isDateRangePreset, resolveDateRange, type DateRangePreset } from "@/lib/date-range";
import { Plus, Pencil, Sparkles, Upload } from "lucide-react";

export default async function TimeEntriesPage({
  searchParams,
}: {
  searchParams: Promise<{
    client?: string;
    range?: string;
    start?: string;
    end?: string;
    performedBy?: string;
    project?: string;
  }>;
}) {
  const params = await searchParams;
  const clientId = params.client ?? "all";
  const performedBy = params.performedBy ?? "all";
  const project = params.project?.trim() || null;
  const range: DateRangePreset = isDateRangePreset(params.range) ? params.range : "all";
  const start = params.start ?? "";
  const end = params.end ?? "";
  const dateRange = resolveDateRange(range, start, end);

  const {
    data: [entries, clients, serviceTypes, staff, projects],
  } = await requireOrgContext((tx) =>
    Promise.all([
      tx.timeEntry.findMany({
        where: {
          ...(clientId !== "all" ? { clientId } : {}),
          ...(performedBy !== "all" ? { performedByUserId: performedBy } : {}),
          ...(dateRange ? { date: dateRange } : {}),
          ...(project ? { project } : {}),
        },
        orderBy: { date: "desc" },
        take: 200,
        include: {
          client: true,
          serviceType: true,
          loggedByUser: true,
          performedByUser: { select: { id: true, name: true } },
        },
      }),
      tx.client.findMany({ where: { activeStatus: true }, orderBy: { name: "asc" } }),
      tx.serviceType.findMany({ orderBy: { code: "asc" } }),
      tx.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
      // Every project already used, per client -- offered as suggestions so
      // "CMMC Level 1" is not also typed as "CMMC L1" next week.
      tx.timeEntry.findMany({
        where: { project: { not: null } },
        distinct: ["clientId", "project"],
        select: { clientId: true, project: true },
      }),
    ]),
  );

  const clientOptions = clients.map((c) => ({
    id: c.id,
    name: c.name,
    shortName: c.shortName,
    isInternal: c.isInternal,
  }));
  const projectOptions = projects.flatMap((p) => (p.project ? [{ clientId: p.clientId, project: p.project }] : []));
  const serviceTypeOptions = serviceTypes.map((st) => ({
    id: st.id,
    code: st.code,
    label: st.label,
    billingMinimumHours: Number(st.billingMinimumHours),
    rateOverride: st.rateOverride ? Number(st.rateOverride) : null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Time entries</h1>
        <p className="text-muted-foreground">Billable hours logged against clients.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <TimeEntriesTabs />
        {/* Four actions do not fit across a phone -- as a single flex row the
            last one, Log time, ran off the edge of the screen. A 2x2 grid at
            full width instead: grid items stretch, so each is a large tap
            target, and it becomes the original inline row from `sm` up. */}
        <div className="grid w-full grid-cols-2 gap-2 [&>*]:h-10 sm:flex sm:w-auto sm:flex-wrap sm:[&>*]:h-8">
          <VoiceLoggerDialog clients={clientOptions} serviceTypes={serviceTypeOptions} />
          <Button variant="outline" render={<Link href="/time-entries/import" />}>
            <Upload className="mr-1 h-4 w-4" /> Import CSV
          </Button>
          <AiTimeEntryDialog
            clients={clientOptions}
            serviceTypes={serviceTypeOptions}
            trigger={
              <Button variant="outline">
                <Sparkles className="mr-1 h-4 w-4" /> AI entry
              </Button>
            }
          />
          <TimeEntryDialog
            clients={clientOptions}
            serviceTypes={serviceTypeOptions}
            staff={staff}
            projects={projectOptions}
            trigger={
              <Button>
                <Plus className="mr-1 h-4 w-4" /> Log time
              </Button>
            }
          />
        </div>
      </div>

      {project && (
        <p className="text-sm text-muted-foreground">
          Showing project <span className="font-medium text-foreground">{project}</span> only ·{" "}
          <Link
            href={`/time-entries?${new URLSearchParams(
              Object.entries({ ...params, project: undefined }).filter(
                (kv): kv is [string, string] => typeof kv[1] === "string",
              ),
            )}`}
            className="underline underline-offset-2"
          >
            show all
          </Link>
        </p>
      )}

      <TimeEntryFilters
        clientId={clientId}
        range={range}
        start={start}
        end={end}
        clients={clientOptions}
        staff={staff}
        performedBy={performedBy}
      />

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Hours</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Performed by</TableHead>
              <TableHead>Billed</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="whitespace-nowrap">
                  {entry.date.toISOString().slice(0, 10)}
                </TableCell>
                <TableCell>{entry.client.name}</TableCell>
                <TableCell className="font-mono text-xs">{entry.serviceType.code}</TableCell>
                <TableCell>{entry.durationHours.toString()}</TableCell>
                <TableCell className="max-w-xs truncate" title={entry.description}>
                  {entry.project && (
                    <Link
                      href={`/time-entries?client=${entry.clientId}&project=${encodeURIComponent(entry.project)}`}
                      className="mr-1.5"
                    >
                      <Badge variant="outline">{entry.project}</Badge>
                    </Link>
                  )}
                  {entry.description}
                </TableCell>
                <TableCell>{BILLABLE_STATUS_LABELS[entry.billableStatus]}</TableCell>
                {/* Who did the work, which is not always who typed it in. */}
                <TableCell className="whitespace-nowrap">{entry.performedByUser.name}</TableCell>
                <TableCell>
                  <Badge variant={entry.invoiceId ? "secondary" : "outline"}>
                    {entry.invoiceId ? "Billed" : "Unbilled"}
                  </Badge>
                </TableCell>
                <TableCell className="flex justify-end gap-1">
                  <TimeEntryDialog
                    entryId={entry.id}
                    clients={clientOptions}
                    serviceTypes={serviceTypeOptions}
                    defaultValues={{
                      clientId: entry.clientId,
                      serviceTypeId: entry.serviceTypeId,
                      date: entry.date.toISOString().slice(0, 10),
                      durationHours: Number(entry.durationHours),
                      description: entry.description,
                      billableStatus: entry.billableStatus,
                      rateOverride:
                        entry.rateOverride === null ? null : Number(entry.rateOverride),
                      travelMinutes: entry.travelMinutes,
                      performedByUserId: entry.performedByUser.id,
                      project: entry.project,
                    }}
                    staff={staff}
                    projects={projectOptions}
                    trigger={
                      <Button variant="ghost" size="icon-sm">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    }
                  />
                  <DeleteTimeEntryButton id={entry.id} isBilled={entry.invoiceId !== null} />
                </TableCell>
              </TableRow>
            ))}
            {entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                  No time entries match these filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
