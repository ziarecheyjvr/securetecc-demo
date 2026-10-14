import { demoStorage } from "@/lib/supabase/demo-storage";

// DEMO BUILD: a stand-in for the service-role client. Storage writes to
// demo-data/storage on disk; auth.admin just mints ids for new staff rows
// (any password signs in, so there is nothing else to store).
export function createAdminClient() {
  return {
    storage: demoStorage,
    auth: {
      admin: {
        async createUser(_input: { email: string; password?: string; email_confirm?: boolean }) {
          return { data: { user: { id: crypto.randomUUID() } }, error: null as { message: string } | null };
        },
        async listUsers() {
          return { data: { users: [] as { id: string; email?: string }[] }, error: null };
        },
      },
    },
  };
}
