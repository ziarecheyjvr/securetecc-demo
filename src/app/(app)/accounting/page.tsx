import { redirect } from "next/navigation";

/** Accounting opens on what needs doing: the work not yet invoiced. */
export default function AccountingPage() {
  redirect("/accounting/to-bill");
}
