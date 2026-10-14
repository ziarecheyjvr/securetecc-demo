"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireAdminContext, requireOrgContext } from "@/lib/auth";
import { withRLS } from "@/lib/db/rls";
import { createAdminClient } from "@/lib/supabase/admin";
import { prisma } from "@/lib/db/prisma";
import {
  organizationFormSchema,
  staffFormSchema,
  type OrganizationFormValues,
  type StaffFormValues,
} from "@/lib/validations/organization";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateOrganization(
  input: OrganizationFormValues,
): Promise<ActionResult> {
  const parsed = organizationFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  const { authUserId, appUser } = await requireAdminContext();

  try {
    // The "org: admin can update own org" policy gates this at the DB level
    // too, so a non-admin calling this action directly still can't write.
    await withRLS(authUserId, (tx) =>
      tx.organization.update({
        where: { id: appUser.organizationId },
        data: {
          name: data.name,
          supportEmail: data.supportEmail,
          notificationFromEmail: data.notificationFromEmail || null,
          ticketNotificationEmail: data.ticketNotificationEmail || null,
          invoiceFromEmail: data.invoiceFromEmail || null,
          phone: data.phone || null,
          logoUrl: data.logoUrl || null,
          brandColorPrimary: data.brandColorPrimary,
          brandColorAccent: data.brandColorAccent,
          monthlyRevenueGoal: data.monthlyRevenueGoal,
          billerName: data.billerName || null,
          billerAddress1: data.billerAddress1 || null,
          billerAddress2: data.billerAddress2 || null,
          billerCityStateZip: data.billerCityStateZip || null,
          billerMobilePhone: data.billerMobilePhone || null,
          billerEmail: data.billerEmail || null,
          website: data.website || null,
          invoiceForLabel: data.invoiceForLabel || null,
          checkPayableTo: data.checkPayableTo || null,
          acceptedPaymentMethods: data.acceptedPaymentMethods || null,
        },
      }),
    );
  } catch (err: unknown) {
    if (typeof err === "object" && err !== null && "code" in err) {
      if ((err as { code?: string }).code === "P2002") {
        return { ok: false, error: "Another organization already uses that support email." };
      }
    }
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }

  revalidatePath("/settings/organization");
  return { ok: true };
}

/**
 * Flips emailDomainVerified.
 *
 * Domain/DKIM verification itself is a manual checklist item in Resend (a
 * resolved decision -- no in-app wizard for v1). This is the switch that says
 * "we've done that", and until it's on, every send is skipped by the email
 * gate. Deliberately admin-only and deliberately explicit about what turning
 * it on means.
 */
export async function setEmailDomainVerified(verified: boolean): Promise<ActionResult> {
  const { authUserId, appUser } = await requireAdminContext();

  try {
    await withRLS(authUserId, (tx) =>
      tx.organization.update({
        where: { id: appUser.organizationId },
        data: { emailDomainVerified: verified },
      }),
    );
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }

  revalidatePath("/settings/organization");
  return { ok: true };
}

/**
 * Creates a staff member: a Supabase auth user plus the app-side profile row.
 *
 * Uses the service-role client because Prisma alone can't create an auth.users
 * row -- same category as the seed script's admin bootstrap.
 */
export async function createStaffUser(input: StaffFormValues): Promise<ActionResult> {
  const parsed = staffFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  if (data.password.length === 0) {
    return { ok: false, error: "Set an initial password for the new user." };
  }

  const appUser = await requireAdmin();

  const supabase = createAdminClient();
  const { data: created, error } = await supabase.auth.admin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true,
  });

  if (error && !error.message.includes("already been registered")) {
    return { ok: false, error: error.message };
  }

  const authUserId =
    created?.user?.id ??
    (await supabase.auth.admin.listUsers()).data.users.find((u) => u.email === data.email)?.id;

  if (!authUserId) {
    return { ok: false, error: "Could not resolve the new user's auth id." };
  }

  try {
    // Trusted client: this is tenant-administration work creating a row for
    // someone who has no session of their own yet.
    await prisma.user.upsert({
      where: { authUserId },
      update: { name: data.name, role: data.role, organizationId: appUser.organizationId },
      create: {
        authUserId,
        organizationId: appUser.organizationId,
        name: data.name,
        email: data.email,
        role: data.role,
      },
    });
  } catch (err: unknown) {
    if (typeof err === "object" && err !== null && "code" in err) {
      if ((err as { code?: string }).code === "P2002") {
        return { ok: false, error: "Someone in this organization already uses that email." };
      }
    }
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }

  revalidatePath("/settings/organization");
  return { ok: true };
}

export async function updateStaffRole(
  userId: string,
  role: "admin" | "technician",
): Promise<ActionResult> {
  const { authUserId, appUser } = await requireAdminContext();

  if (userId === appUser.id && role !== "admin") {
    // Otherwise the last admin can lock the whole org out of settings.
    const otherAdmins = await withRLS(authUserId, (tx) =>
      tx.user.count({ where: { role: "admin", id: { not: userId } } }),
    );
    if (otherAdmins === 0) {
      return { ok: false, error: "You're the only admin — promote someone else first." };
    }
  }

  try {
    await withRLS(authUserId, (tx) => tx.user.update({ where: { id: userId }, data: { role } }));
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }

  revalidatePath("/settings/organization");
  return { ok: true };
}

export type NotificationPreference =
  | "receivesTicketEmails"
  | "notifyTaskAssigned"
  | "notifyTaskForReview"
  | "notifyTaskCompleted";

const NOTIFICATION_PREFERENCES: NotificationPreference[] = [
  "receivesTicketEmails",
  "notifyTaskAssigned",
  "notifyTaskForReview",
  "notifyTaskCompleted",
];

/**
 * Toggles one email preference for one person.
 *
 * One action over a named column rather than four near-identical ones. The
 * name is checked against the list above, so a caller can never point this at
 * an arbitrary column.
 *
 * Not admin-only on purpose: these are personal preferences and anyone should
 * be able to turn their own off. Admins can set them for others, which the
 * role check enforces. Off never means uninformed -- the ticket is still in
 * the shared inbox and the task is still on the board.
 */
export async function updateNotificationPreference(
  userId: string,
  preference: NotificationPreference,
  enabled: boolean,
): Promise<ActionResult> {
  if (!NOTIFICATION_PREFERENCES.includes(preference)) {
    return { ok: false, error: "Unknown notification setting." };
  }

  const { authUserId, appUser } = await requireOrgContext();
  if (appUser.role !== "admin" && appUser.id !== userId) {
    return { ok: false, error: "You can only change your own notification settings." };
  }

  try {
    await withRLS(authUserId, (tx) =>
      tx.user.update({ where: { id: userId }, data: { [preference]: enabled } }),
    );
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }

  revalidatePath("/settings/organization");
  return { ok: true };
}
