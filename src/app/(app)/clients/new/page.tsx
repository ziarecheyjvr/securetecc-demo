import { ClientForm } from "@/components/app/client-form";

export default function NewClientPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New client</h1>
        <p className="text-muted-foreground">Add a client to bill and support.</p>
      </div>
      <ClientForm />
    </div>
  );
}
