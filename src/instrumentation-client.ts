import * as Sentry from "@sentry/nextjs";

/**
 * Browser runtime.
 *
 * Errors and tracing only. Session Replay is deliberately left off: it records
 * what people type, and the two surfaces that matter here are a public ticket
 * form where clients describe their problems and an internal app showing
 * client billing. Worth turning on later with explicit masking, not by
 * default.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
