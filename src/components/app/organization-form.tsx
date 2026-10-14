"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  organizationFormSchema,
  staffFormSchema,
  type OrganizationFormValues,
  type StaffFormValues,
} from "@/lib/validations/organization";
import {
  createStaffUser,
  setEmailDomainVerified,
  updateOrganization,
  updateStaffRole,
  updateNotificationPreference,
  type NotificationPreference,
} from "@/app/(app)/settings/organization/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin — full access",
  technician: "Technician — day-to-day work",
};

export function OrganizationForm({ defaultValues }: { defaultValues: OrganizationFormValues }) {
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<OrganizationFormValues>({
    resolver: zodResolver(organizationFormSchema),
    defaultValues,
  });

  const monthlyRevenueGoal = watch("monthlyRevenueGoal");

  async function onSubmit(values: OrganizationFormValues) {
    setSubmitting(true);
    const result = await updateOrganization(values);
    setSubmitting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Organization updated");
  }

  return (
    <Card className="p-6">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Organization name</Label>
            <Input id="name" {...register("name")} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" {...register("phone")} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="supportEmail">Support inbox</Label>
            <Input id="supportEmail" type="email" {...register("supportEmail")} />
            <p className="text-xs text-muted-foreground">
              Must be a real, monitored mailbox — new-ticket alerts are sent here, and it&apos;s
              what clients reach when they reply.
            </p>
            {errors.supportEmail && (
              <p className="text-xs text-destructive">{errors.supportEmail.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="notificationFromEmail">Notification &ldquo;from&rdquo; address</Label>
            <Input
              id="notificationFromEmail"
              type="email"
              placeholder="noreply@alerts.securetecc.com"
              {...register("notificationFromEmail")}
            />
            <p className="text-xs text-muted-foreground">
              The <span className="font-medium">from:</span> on automated ticket and digest
              email. Safe to be a noreply address — replies go to the support inbox, not here.
              Defaults to the support inbox if left blank.
            </p>
            {errors.notificationFromEmail && (
              <p className="text-xs text-destructive">{errors.notificationFromEmail.message}</p>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ticketNotificationEmail">Ticket notifications go to</Label>
            <Input
              id="ticketNotificationEmail"
              type="email"
              placeholder="support@securetecc.com"
              {...register("ticketNotificationEmail")}
            />
            <p className="text-xs text-muted-foreground">
              Where new-ticket alerts and the weekly ticket digest are delivered. Separate from
              the support inbox above, which stays the address clients reply to — point this at
              wherever the team actually watches tickets. Defaults to the support inbox if left
              blank.
            </p>
            {errors.ticketNotificationEmail && (
              <p className="text-xs text-destructive">{errors.ticketNotificationEmail.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="invoiceFromEmail">Invoice &ldquo;from&rdquo; email</Label>
            <Input id="invoiceFromEmail" type="email" {...register("invoiceFromEmail")} />
            <p className="text-xs text-muted-foreground">
              Sender on invoice Gmail drafts. Should match the Google Workspace mailbox the
              drafts are created in.
            </p>
            {errors.invoiceFromEmail && (
              <p className="text-xs text-destructive">{errors.invoiceFromEmail.message}</p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="logoUrl">Logo URL</Label>
          <Input id="logoUrl" placeholder="https://…/logo.png" {...register("logoUrl")} />
          <p className="text-xs text-muted-foreground">
            Used on invoice PDFs and branded email. Must be a public URL that email clients can
            load.
          </p>
          {errors.logoUrl && <p className="text-xs text-destructive">{errors.logoUrl.message}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="brandColorPrimary">Primary colour</Label>
            <Input id="brandColorPrimary" {...register("brandColorPrimary")} />
            {errors.brandColorPrimary && (
              <p className="text-xs text-destructive">{errors.brandColorPrimary.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="brandColorAccent">Accent colour</Label>
            <Input id="brandColorAccent" {...register("brandColorAccent")} />
            {errors.brandColorAccent && (
              <p className="text-xs text-destructive">{errors.brandColorAccent.message}</p>
            )}
          </div>
        </div>

        <div className="space-y-4 border-t pt-6">
          <div>
            <h2 className="font-medium">Targets</h2>
            <p className="text-sm text-muted-foreground">
              Drives the progress meter on the dashboard.
            </p>
          </div>
          <div className="space-y-2 sm:max-w-xs">
            <Label htmlFor="monthlyRevenueGoal">Monthly invoicing goal (USD)</Label>
            <Input
              id="monthlyRevenueGoal"
              type="number"
              min={0}
              step={500}
              {...register("monthlyRevenueGoal", { valueAsNumber: true })}
            />
            {errors.monthlyRevenueGoal && (
              <p className="text-xs text-destructive">{errors.monthlyRevenueGoal.message}</p>
            )}
            {/* Common targets as one click; the field stays free-form for
                anything between. */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[10000, 15000, 20000, 25000].map((amount) => (
                <Button
                  key={amount}
                  type="button"
                  size="sm"
                  variant={monthlyRevenueGoal === amount ? "default" : "outline"}
                  onClick={() => setValue("monthlyRevenueGoal", amount, { shouldDirty: true })}
                >
                  ${(amount / 1000).toFixed(0)}k
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              The dashboard meter reads against this. $10k is the current floor, not the ceiling.
            </p>
          </div>
        </div>

        <div className="space-y-4 border-t pt-6">
          <div>
            <h2 className="font-medium">Invoice letterhead</h2>
            <p className="text-sm text-muted-foreground">
              The person and contact details printed on invoice PDFs — separate from the
              organization name above.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="billerName">Biller name</Label>
              <Input id="billerName" placeholder="e.g. Jordan Lee" {...register("billerName")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoiceForLabel">&ldquo;For&rdquo; label</Label>
              <Input id="invoiceForLabel" placeholder="IT Services" {...register("invoiceForLabel")} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="billerAddress1">Address line 1</Label>
              <Input id="billerAddress1" {...register("billerAddress1")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="billerAddress2">Address line 2</Label>
              <Input id="billerAddress2" placeholder="e.g. MailBox 220" {...register("billerAddress2")} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="billerCityStateZip">City, state, ZIP</Label>
            <Input id="billerCityStateZip" {...register("billerCityStateZip")} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="billerMobilePhone">Mobile phone</Label>
              <Input id="billerMobilePhone" {...register("billerMobilePhone")} />
              <p className="text-xs text-muted-foreground">
                &ldquo;Office:&rdquo; uses the phone number above; this is the &ldquo;Mobile:&rdquo; line.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="billerEmail">Biller email</Label>
              <Input id="billerEmail" type="email" {...register("billerEmail")} />
              {errors.billerEmail && (
                <p className="text-xs text-destructive">{errors.billerEmail.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <Input id="website" placeholder="https://securetecc.com" {...register("website")} />
            {errors.website && <p className="text-xs text-destructive">{errors.website.message}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="checkPayableTo">Checks payable to</Label>
              <Input id="checkPayableTo" placeholder="e.g. Jordan Lee" {...register("checkPayableTo")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acceptedPaymentMethods">Accepted payment methods</Label>
              <Input
                id="acceptedPaymentMethods"
                placeholder="e.g. ACH, Zelle, PayPal, and Venmo"
                {...register("acceptedPaymentMethods")}
              />
            </div>
          </div>
        </div>

        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Save organization"}
        </Button>
      </form>
    </Card>
  );
}

/**
 * Domain verification is a manual checklist against Resend (resolved decision:
 * no in-app wizard for v1). This surfaces the steps and the switch, and is
 * explicit that nothing sends until it's on.
 */
export function EmailDomainChecklist({
  verified,
  notificationFromEmail,
}: {
  verified: boolean;
  /** Resend only ever sends from this address, so this is the only domain to verify. */
  notificationFromEmail: string;
}) {
  const [pending, setPending] = useState(false);
  // Only the notification sender's domain. Deliberately NOT the invoice
  // sender's: invoices go out as Gmail drafts now, never through Resend, so
  // listing that domain here would send you to verify one Resend never uses.
  const domains = [notificationFromEmail.split("@")[1]].filter(Boolean) as string[];

  async function toggle(next: boolean) {
    setPending(true);
    const result = await setEmailDomainVerified(next);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(next ? "Email sending enabled" : "Email sending disabled");
  }

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-medium">Email domain verification</h2>
          <p className="text-sm text-muted-foreground">
            No email is sent while this is off — every send is skipped.
          </p>
        </div>
        <Badge variant={verified ? "default" : "secondary"}>
          {verified ? "Verified" : "Not verified"}
        </Badge>
      </div>

      <ol className="mb-4 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
        <li>
          Add {domains.length === 1 ? "this domain" : "these domains"} in Resend:{" "}
          <span className="font-medium text-foreground">
            {domains.length > 0 ? domains.join(", ") : "—"}
          </span>
        </li>
        <li>Publish the DKIM, SPF, and DMARC records Resend gives you in DNS.</li>
        <li>Wait for Resend to report the domain as verified.</li>
        <li>Send yourself a test, then turn the switch below on.</li>
      </ol>

      <Button
        variant={verified ? "outline" : "default"}
        disabled={pending}
        onClick={() => toggle(!verified)}
      >
        {pending ? "Saving…" : verified ? "Turn sending off" : "Mark verified & enable sending"}
      </Button>
    </Card>
  );
}

export function StaffSection({
  staff,
  currentUserId,
}: {
  staff: {
    id: string;
    name: string;
    email: string;
    role: string;
    receivesTicketEmails: boolean;
    notifyTaskAssigned: boolean;
    notifyTaskForReview: boolean;
    notifyTaskCompleted: boolean;
  }[];
  currentUserId: string;
}) {
  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-medium">Staff</h2>
          <p className="text-sm text-muted-foreground">
            Admins manage settings and invoices; technicians do day-to-day work.
          </p>
        </div>
        <NewStaffDialog />
      </div>

      <div className="divide-y">
        {staff.map((user) => (
          <div key={user.id} className="flex items-center justify-between gap-4 py-3">
            <div>
              <p className="font-medium">
                {user.name}
                {user.id === currentUserId && (
                  <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                )}
              </p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {/* What this person is emailed about. Off never means
                  uninformed -- the ticket is in the shared inbox and the task
                  is on the board either way. */}
              <NotificationToggle
                userId={user.id}
                preference="notifyTaskAssigned"
                label="Task assigned"
                initial={user.notifyTaskAssigned}
              />
              <NotificationToggle
                userId={user.id}
                preference="notifyTaskForReview"
                label="For review"
                initial={user.notifyTaskForReview}
              />
              <NotificationToggle
                userId={user.id}
                preference="notifyTaskCompleted"
                label="Task done"
                initial={user.notifyTaskCompleted}
              />
              <NotificationToggle
                userId={user.id}
                preference="receivesTicketEmails"
                label="Ticket assigned"
                initial={user.receivesTicketEmails}
              />
              <StaffRoleSelect userId={user.id} role={user.role} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/**
 * One email preference for one person.
 *
 * Optimistic, and reverted if the write fails -- a checkbox that appears to
 * save and did not is worse than one that visibly refuses.
 */
function NotificationToggle({
  userId,
  preference,
  label,
  initial,
}: {
  userId: string;
  preference: NotificationPreference;
  label: string;
  initial: boolean;
}) {
  const [on, setOn] = useState(initial);
  const [pending, setPending] = useState(false);

  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
      <Checkbox
        checked={on}
        disabled={pending}
        onCheckedChange={async (next: boolean | "indeterminate") => {
          const previous = on;
          const value = next === true;
          setOn(value);
          setPending(true);
          const result = await updateNotificationPreference(userId, preference, value);
          setPending(false);
          if (!result.ok) {
            setOn(previous);
            toast.error(result.error);
          }
        }}
        aria-label={`Email ${label.toLowerCase()} notifications to this person`}
      />
      {label}
    </label>
  );
}

function StaffRoleSelect({ userId, role }: { userId: string; role: string }) {
  const [value, setValue] = useState(role);
  const [pending, setPending] = useState(false);

  async function handleChange(next: string) {
    const previous = value;
    setValue(next);
    setPending(true);
    const result = await updateStaffRole(userId, next as "admin" | "technician");
    setPending(false);
    if (!result.ok) {
      setValue(previous);
      toast.error(result.error);
      return;
    }
    toast.success("Role updated");
  }

  return (
    <Select value={value} onValueChange={(v) => handleChange(v ?? role)} disabled={pending}>
      <SelectTrigger className="w-64">
        <SelectValue>{(v) => ROLE_LABELS[v as string]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {Object.entries(ROLE_LABELS).map(([v, label]) => (
          <SelectItem key={v} value={v}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function NewStaffDialog() {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<StaffFormValues>({
    resolver: zodResolver(staffFormSchema),
    defaultValues: { name: "", email: "", role: "technician", password: "" },
  });

  const role = watch("role");

  async function onSubmit(values: StaffFormValues) {
    setSubmitting(true);
    const result = await createStaffUser(values);
    setSubmitting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Staff member added");
    reset();
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>Add staff</Button>} />
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Add staff member</DialogTitle>
            <DialogDescription>
              Creates their login and profile. Share the initial password with them directly and
              have them change it.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="staffName">Name</Label>
              <Input id="staffName" {...register("name")} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="staffEmail">Email</Label>
              <Input id="staffEmail" type="email" {...register("email")} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="staffRole">Role</Label>
              <Select value={role} onValueChange={(v) => setValue("role", (v ?? "technician") as "admin" | "technician")}>
                <SelectTrigger id="staffRole">
                  <SelectValue>{(v) => ROLE_LABELS[v as string]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_LABELS).map(([v, label]) => (
                    <SelectItem key={v} value={v}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="staffPassword">Initial password</Label>
              <Input id="staffPassword" type="password" {...register("password")} />
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
