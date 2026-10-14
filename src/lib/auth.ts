import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { withRLS, type TxClient } from "@/lib/db/rls";
import type { Prisma } from "@/generated/prisma/client";

type AppUser = Prisma.UserGetPayload<{ include: { organization: true } }>;

// Thrown (and caught) inside the withRLS transaction below so a missing app
// user redirects the same way whether or not a caller passed a callback --
// never let next/navigation's redirect() throw from inside a Prisma
// interactive transaction callback directly, since that couples this app's
// navigation control-flow to how Prisma happens to propagate errors out of
// $transaction().
class AppUserNotFoundError extends Error {}
class NotAdminError extends Error {}

// Resolves the signed-in Supabase auth user to their app-side profile row
// (organization + role). This is the single place request handlers should
// call to find out "who is making this request" -- proxy.ts only guarantees
// *a* session exists, not that a matching public.users row does.
//
// Runs under withRLS like any other query: the "users: staff can read own
// org roster" policy resolves via the SECURITY DEFINER current_org_id(), so
// this doesn't need a bypass -- it's the same DB-level check every other
// query gets.
// supabase.auth.getUser() validates the JWT against Supabase's Auth API --
// a real network round trip, not a local decode. getCurrentAppUser() and
// getCurrentAuthUserId() used to each call it independently, so
// requireOrgContext() (used on every server-rendered page) fired it twice
// per request on top of the middleware's own call.
//
// react's cache() now makes that structural rather than a convention the
// callers have to keep: it dedupes for the lifetime of one request, so every
// helper below can call this freely and only the first one pays the Auth API
// round trip.
const getVerifiedAuthUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  return authUser;
});

export async function getCurrentAppUser() {
  const authUser = await getVerifiedAuthUser();
  if (!authUser) return null;

  const appUser = await withRLS(authUser.id, (tx) =>
    tx.user.findUnique({
      where: { authUserId: authUser.id },
      include: { organization: true },
    }),
  );

  return appUser;
}

// Returns the verified Supabase auth user id for the current request, for
// callers (server actions) that need to open their own withRLS transaction.
export async function getCurrentAuthUserId() {
  const authUser = await getVerifiedAuthUser();
  return authUser?.id ?? null;
}

export async function requireAppUser() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  return appUser;
}

export async function requireAdmin() {
  const appUser = await requireAppUser();
  if (appUser.role !== "admin") redirect("/dashboard?error=admin-only");
  return appUser;
}

// For server actions/route handlers: one call to get both the verified auth
// user id (needed to open a withRLS transaction) and the resolved app user
// (org + role, for building the write payload and any role checks). Calls
// getVerifiedAuthUser() exactly once -- every page in the app goes through
// here, so this is the highest-leverage spot to avoid a second Auth API
// round trip per request.
//
// Pass a callback to also run that page/action's own query in the SAME
// withRLS transaction as the app-user lookup, instead of the caller opening
// a second transaction right after. Each transaction pays its own
// connection-acquisition + SET claims + SET LOCAL ROLE round trips against
// Supabase, so folding the two together roughly halves that fixed cost per
// request -- the callback receives the open `tx` so it can run in-transaction
// queries rather than calling withRLS again itself.
export async function requireOrgContext(): Promise<{
  authUserId: string;
  appUser: AppUser;
}>;
export async function requireOrgContext<T>(
  fn: (tx: TxClient, appUser: AppUser) => Promise<T>,
): Promise<{ authUserId: string; appUser: AppUser; data: T }>;
export async function requireOrgContext<T>(fn?: (tx: TxClient, appUser: AppUser) => Promise<T>) {
  const authUser = await getVerifiedAuthUser();
  if (!authUser) redirect("/login");

  let outcome: { appUser: AppUser; data: T | undefined };
  try {
    outcome = await withRLS(authUser.id, async (tx) => {
      const appUser = await tx.user.findUnique({
        where: { authUserId: authUser.id },
        include: { organization: true },
      });
      if (!appUser) throw new AppUserNotFoundError();

      const data = fn ? await fn(tx, appUser) : undefined;
      return { appUser, data };
    });
  } catch (err) {
    if (err instanceof AppUserNotFoundError) redirect("/login");
    if (err instanceof NotAdminError) redirect("/dashboard?error=admin-only");
    throw err;
  }

  return { authUserId: authUser.id, appUser: outcome.appUser, data: outcome.data as T };
}

// Admin-gated equivalent of requireOrgContext, for the write actions that
// previously called requireAdmin() and then requireOrgContext() back to back.
// That pattern cost two Auth round trips and two full withRLS transactions
// (each paying its own connection acquisition, BEGIN, claims setup and
// COMMIT) to answer one question. This does it once.
//
// The role check happens AFTER the lookup rather than in a separate pass,
// which is also why it can share the callback's transaction: by the time the
// callback runs we already know the caller is an admin.
export async function requireAdminContext(): Promise<{
  authUserId: string;
  appUser: AppUser;
}>;
export async function requireAdminContext<T>(
  fn: (tx: TxClient, appUser: AppUser) => Promise<T>,
): Promise<{ authUserId: string; appUser: AppUser; data: T }>;
export async function requireAdminContext<T>(fn?: (tx: TxClient, appUser: AppUser) => Promise<T>) {
  const context = await requireOrgContext(async (tx, appUser) => {
    if (appUser.role !== "admin") throw new NotAdminError();
    return fn ? await fn(tx, appUser) : undefined;
  });
  return context;
}
