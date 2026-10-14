import * as Sentry from "@sentry/nextjs";

/**
 * Node runtime — server components, server actions, route handlers, cron.
 *
 * `dataCollection` is deliberately NOT passed. Passing the object at all (even
 * empty) flips every unset category to its permissive default, which would
 * start shipping request bodies, cookies and headers to Sentry. This app
 * handles client billing details and ticket descriptions people type in
 * confidence; the conservative default (sendDefaultPii: false) is the right
 * one here, and anything we want reported gets attached explicitly.
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Full sampling in dev where volume is trivial; 10% in production.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // includeLocalVariables is deliberately OFF.
  //
  // It was on, to capture locals at a throw site. It works by attaching
  // Node's inspector to the running process -- which is why every production
  // invocation logged "Debugger listening on ws://127.0.0.1:...". On Vercel
  // that open inspector session kept the function from settling, so Server
  // Actions ran to completion but their response was never returned: the
  // ticket form and the status lookup both sat on "Submitting…"/"Checking…"
  // forever, while ordinary route handlers were unaffected.
  //
  // Do not re-enable it on serverless. If locals are needed for a specific
  // bug, capture them explicitly with Sentry.setContext at the throw site.

  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
});
