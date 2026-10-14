import Link from "next/link";
import { Suspense } from "react";
import { requireOrgContext } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { ListSearch } from "@/components/app/list-search";
import { Plus } from "lucide-react";

const CADENCES = ["All", "Monthly", "Quarterly"] as const;
type Cadence = (typeof CADENCES)[number];

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cadence?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const search = (sp.q ?? "").trim();
  const cadence: Cadence = CADENCES.includes(sp.cadence as Cadence)
    ? (sp.cadence as Cadence)
    : "All";
  const showInactive = sp.status === "all";

  const { data: clients } = await requireOrgContext((tx) =>
    tx.client.findMany({
      where: {
        ...(showInactive ? {} : { activeStatus: true }),
        ...(cadence === "All" ? {} : { billingCadence: cadence }),
        ...(search
          ? {
              // The fields someone actually searches a client by: the company,
              // the short name that prefixes their invoice numbers, and the
              // addresses and people on the account.
              OR: [
                { name: { contains: search, mode: "insensitive" as const } },
                { shortName: { contains: search, mode: "insensitive" as const } },
                { email: { contains: search, mode: "insensitive" as const } },
                { ownerName: { contains: search, mode: "insensitive" as const } },
                { billingContactName: { contains: search, mode: "insensitive" as const } },
                { cityStateZip: { contains: search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: { name: "asc" },
    }),
  );

  const query = (next: Record<string, string | null>) => {
    const q = new URLSearchParams();
    if (search) q.set("q", search);
    if (cadence !== "All") q.set("cadence", cadence);
    if (showInactive) q.set("status", "all");
    for (const [k, v] of Object.entries(next)) {
      if (v === null) q.delete(k);
      else q.set(k, v);
    }
    return `/clients${q.size ? `?${q}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="text-muted-foreground">
            {clients.length} {showInactive ? "total" : "active"}
            {cadence !== "All" ? ` · billed ${cadence.toLowerCase()}` : ""}
          </p>
        </div>
        <Button render={<Link href="/clients/new" />}>
          <Plus className="mr-1 h-4 w-4" /> New client
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {CADENCES.map((c) => (
            <Button
              key={c}
              size="sm"
              variant={c === cadence ? "default" : "outline"}
              render={<Link href={query({ cadence: c === "All" ? null : c })} />}
            >
              {c === "All" ? "All cycles" : c}
            </Button>
          ))}
          <Button
            size="sm"
            variant={showInactive ? "default" : "outline"}
            render={<Link href={query({ status: showInactive ? null : "all" })} />}
          >
            Include inactive
          </Button>
        </div>
        <Suspense fallback={null}>
          <ListSearch
            initial={search}
            label="Search clients"
            placeholder="Search name, short name, email, contact…"
          />
        </Suspense>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Short name</TableHead>
              <TableHead>Billing email</TableHead>
              <TableHead>Billing</TableHead>
              <TableHead>Cycle</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.map((client) => (
              <TableRow key={client.id} className="cursor-pointer">
                <TableCell className="font-medium">
                  <Link href={`/clients/${client.id}`} className="hover:underline">
                    {client.name}
                  </Link>
                </TableCell>
                <TableCell>{client.shortName}</TableCell>
                {/* Billing email rather than a contact name: this list is
                    scanned when working out who an invoice goes to, and the
                    names live on the client's own page. */}
                <TableCell className="max-w-[220px] truncate">
                  {client.email ? (
                    <a href={`mailto:${client.email}`} className="hover:underline">
                      {client.email}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">No billing email</span>
                  )}
                </TableCell>
                <TableCell>
                  {client.billingType}
                  {client.billingRate ? ` · $${client.billingRate.toString()}/hr` : ""}
                </TableCell>
                <TableCell className="text-muted-foreground">{client.billingCadence}</TableCell>
                <TableCell>
                  <Badge variant={client.activeStatus ? "default" : "secondary"}>
                    {client.activeStatus ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {clients.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  {search || cadence !== "All"
                    ? "Nothing matches those filters."
                    : "No clients yet. Add your first one to get started."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
