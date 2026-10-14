import * as Sentry from "@sentry/nextjs";

/**
 * Edge runtime — proxy.ts runs here, which is where host routing and the auth
 * gate live. Same conservative data posture as the server config.
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
});
