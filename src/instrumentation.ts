import * as Sentry from "@sentry/nextjs";

/**
 * Server-side registration hook. Next calls this once per runtime at boot.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
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
