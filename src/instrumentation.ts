import * as Sentry from "@sentry/nextjs";

/**
 * Server-side registration hook. Next calls this once per runtime at boot.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");

    // DEMO BUILD: on Vercel (or with DEMO_DB_IN_PROCESS=1) the database runs
    // inside this process. Locally `npm run dev` runs it as its own process
    // instead. Never during `next build`, which has no snapshot to serve yet.
    //
    // On Vercel this hook also runs in the proxy's own function, which is
    // packaged without the snapshot or PGlite and never queries the database.
    // Throwing there would fail the proxy -- and with it every request, even
    // static pages -- so the database starts only where a snapshot exists.
    const inProcess = process.env.VERCEL === "1" || process.env.DEMO_DB_IN_PROCESS === "1";
    if (inProcess && process.env.NEXT_PHASE !== "phase-production-build") {
      const { existsSync } = await import("node:fs");
      const { join } = await import("node:path");
      const { DEMO_SNAPSHOT_FILE } = await import("./lib/demo");
      if (existsSync(join(/*turbopackIgnore: true*/ process.cwd(), DEMO_SNAPSHOT_FILE))) {
        const { startInProcessDemoDb } = await import("./lib/demo-db-runtime");
        await startInProcessDemoDb();
      } else {
        console.warn("[demo-db] No snapshot in this function; not starting the database here.");
      }
    }
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

/**
 * Catches unhandled errors thrown out of server components, server actions and
 * route handlers -- the ones that currently surface as a toast with no trace.
 */
export const onRequestError = Sentry.captureRequestError;
