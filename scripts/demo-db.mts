/**
 * The demo database: PGlite (Postgres compiled to WebAssembly) served over
 * the normal Postgres wire protocol on localhost, so Prisma connects to it
 * exactly as it would to Supabase. Nothing to install or host.
 *
 *   npx tsx scripts/demo-db.mts            # start the database only
 *   npx tsx scripts/demo-db.mts --next     # start it, then `next dev` (npm run dev)
 *   npx tsx scripts/demo-db.mts --reset    # wipe demo-data/ and regenerate everything
 *
 * On first start (or --reset) it applies every Prisma migration, the one
 * Supabase SQL function the public ticket-status page calls, and then runs
 * prisma/demo-seed.ts to fill the database with random test data.
 *
 * PGlite takes one connection at a time; the socket server queues the rest.
 * The app's Prisma client holds a single pooled connection (connection_limit=1
 * in .env), so run one app process against it at a time.
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "demo-data");
const PG_DIR = path.join(DATA_DIR, "pg");
const PORT = Number(process.env.DEMO_DB_PORT ?? 54329);
// pgbouncer=true stops Prisma naming its prepared statements. PGlite is one
// backend shared by every connection, so names left by the seed survive into
// the app's connection and collide ("prepared statement s0 already exists").
const DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres?sslmode=disable&connection_limit=1&pgbouncer=true`;

const args = new Set(process.argv.slice(2));

if (args.has("--reset") && existsSync(DATA_DIR)) {
  rmSync(DATA_DIR, { recursive: true, force: true });
  console.log("[demo-db] Wiped demo-data/.");
}

const fresh = !existsSync(PG_DIR);
mkdirSync(DATA_DIR, { recursive: true });

const db = await PGlite.create(PG_DIR);

if (fresh) {
  const migrationsDir = path.join(ROOT, "prisma", "migrations");
  const migrations = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  for (const name of migrations) {
    await db.exec(readFileSync(path.join(migrationsDir, name, "migration.sql"), "utf8"));
  }
  console.log(`[demo-db] Applied ${migrations.length} migrations.`);

  // From supabase/migrations/0003 -- the public status page's lookup. The
  // rest of those files are RLS policies and storage buckets, which the demo
  // does without.
  await db.exec(`
    create or replace function public.lookup_ticket_status(p_ticket_number text, p_contact_email text)
    returns table (ticket_number text, status text, submitted_at timestamptz, issue_type text)
    language sql stable as $$
      select "ticketNumber", status::text, "createdAt", "issueType"
      from public.tickets
      where "ticketNumber" = p_ticket_number and lower("contactEmail") = lower(p_contact_email);
    $$;
  `);
}

const server = new PGLiteSocketServer({ db, port: PORT, host: "127.0.0.1", debug: !!process.env.DEMO_DB_DEBUG });
await server.start();
console.log(`[demo-db] Postgres (PGlite) listening on 127.0.0.1:${PORT}`);

function run(cmd: string, cmdArgs: string[]) {
  return spawn(cmd, cmdArgs, {
    stdio: "inherit",
    // SAFE_MODE is forced here as well as in .env: nothing started from this
    // script may send email or touch Google, whatever the environment says.
    env: { ...process.env, DATABASE_URL, DIRECT_URL: DATABASE_URL, SAFE_MODE: "1" },
  });
}

async function shutdown(code = 0) {
  await server.stop().catch(() => {});
  await db.close().catch(() => {});
  process.exit(code);
}
process.on("SIGINT", () => void shutdown(0));
process.on("SIGTERM", () => void shutdown(0));

if (fresh) {
  console.log("[demo-db] Generating demo data…");
  const code = await new Promise<number>((resolve) =>
    run("npx", ["tsx", "prisma/demo-seed.ts"]).on("exit", (c) => resolve(c ?? 1)),
  );
  if (code !== 0) {
    console.error("[demo-db] Seeding failed; wiping demo-data/ so the next start retries.");
    await server.stop().catch(() => {});
    await db.close().catch(() => {});
    rmSync(DATA_DIR, { recursive: true, force: true });
    process.exit(code);
  }
}

if (args.has("--next")) {
  const next = run("npx", ["next", "dev"]);
  next.on("exit", (c) => void shutdown(c ?? 0));
} else {
  console.log("[demo-db] Ready. Ctrl+C to stop.");
}
