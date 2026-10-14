import path from "node:path";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Server Actions reject a request whose Origin does not match the Host,
      // as CSRF protection. The ticket portal is served THROUGH a rewrite --
      // ticket.securetecc.com/ is rewritten to /support by proxy.ts -- and the
      // custom domains sit in front of Vercel's own, so the comparison fails
      // and the POST is refused before the action's response ever reaches the
      // browser. That is what left the form on "Submitting…" with a status-0
      // POST in the logs and no error anywhere.
      //
      // Listing the real hosts restores the check rather than disabling it:
      // these are the only origins the app is ever served from.
      allowedOrigins: [
        "ticket.securetecc.com",
        "manage.securetecc.com",
        "custom-app-six.vercel.app",
        "custom-app-secure-tecc.vercel.app",
        "custom-app-git-main-secure-tecc.vercel.app",
      ],
      // Server Actions default to a 1 MB body, and the support form was
      // advertising 10 MB per file across 5 files. Anything over 1 MB failed
      // with a 413 the form never surfaced.
      //
      // 4 MB, not 50: Vercel caps a serverless request body at 4.5 MB, so a
      // larger number here would only move the failure from Next.js to the
      // platform. Attachment limits below are set to fit inside this.
      bodySizeLimit: "4mb",
    },
  },
  // Stop announcing the framework in responses -- free, no functional effect.
  poweredByHeader: false,
  // Security-audit fix: no headers were set anywhere (checked proxy.ts too).
  // Scoped deliberately narrow for now -- these three are safe, unconditional
  // wins that can't break anything the app currently does. A real script-src
  // CSP is a separate, bigger piece of work (needs nonces threaded through
  // every inline script/portal-rendered dialog) and is intentionally not
  // attempted here to avoid shipping a CSP that silently breaks the app.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Replaces the older X-Frame-Options; blocks clickjacking by
          // refusing to render this app inside anyone's <iframe>.
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          // 2 years + preload is a one-way door (undoing it once submitted to
          // browsers' preload lists takes months), so start without preload;
          // add it deliberately later once you're confident every subdomain
          // that will ever exist under securetecc.com is HTTPS-only.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
  // A stray lockfile in a parent directory (outside this repo) otherwise
  // makes Next.js guess the wrong workspace root.
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Prisma's generated client lives at a custom output path
  // (src/generated/prisma, per prisma/schema.prisma), and Next.js's
  // serverless file tracer doesn't follow the dynamically-loaded native
  // query-engine binary there on its own -- it gets left out of the
  // deployed function bundle, causing PrismaClientInitializationError
  // ("could not locate the Query Engine") in production despite `prisma
  // generate` succeeding at build time. This forces it to be included.
  // Note the glob covers src/generated/**, not just src/generated/prisma/**,
  // so the engine copy staged by scripts/stage-prisma-engine.mjs is traced too.
  outputFileTracingIncludes: {
    // public/securetecc-logo.png is read from disk at render time by
    // src/lib/pdf/logo.ts (the invoice PDF's logo + watermark fallback when
    // Organization.logoUrl isn't set). Static assets in public/ are served by
    // the CDN, not traced into function bundles, so it has to be listed here
    // or that read 404s in production and invoices silently lose their logo.
    "/**": [
      "./src/generated/**/*",
      "./public/securetecc-logo.png",
      "./public/securetecc-watermark.png",
      // Montserrat/Quattrocento Sans .woff files read at render time by
      // src/lib/pdf/fonts.ts. Same reason as the logo: not traced otherwise,
      // and without them every invoice silently falls back to Helvetica.
      "./src/lib/pdf/fonts/*.woff",
    ],
  },
  // ...but shipping the binary isn't sufficient on its own. Bundling
  // @prisma/client rewrites the __dirname its runtime uses to locate that
  // binary, so it searched /var/task/src/generated (one level above where
  // the file actually lands, /var/task/src/generated/prisma) and still
  // threw "could not locate the Query Engine". Keeping the package
  // external preserves the real __dirname so the lookup resolves.
  // See https://pris.ly/d/engine-not-found-nextjs
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
};

export default withSentryConfig(nextConfig, {
  org: "securetecc",
  project: "javascript-nextjs",

  // Build-time secret, distinct from the DSN. Absent locally, so source-map
  // upload simply no-ops here and runs in CI/Vercel where it's set.
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Better client stack traces at the cost of a slightly larger upload.
  widenClientFileUpload: true,

  // Sentry wraps proxy.ts (middleware) automatically. Turned OFF because
  // every POST that passes through the middleware hung on production while
  // GETs were fine, and /monitoring -- the one POST route the matcher
  // excludes -- worked. Only requests with a body were affected, which points
  // at the wrapper reading the request. Errors from route handlers, Server
  // Actions and pages are still captured; only middleware is uninstrumented.
  autoInstrumentMiddleware: false,

  // Proxies Sentry through our own origin so ad-blockers don't silently drop
  // reports. NOTE: this path must be excluded from proxy.ts's matcher, or the
  // auth gate redirects the tunnel to /login and nothing is ever reported.
  tunnelRoute: "/monitoring",

  silent: !process.env.CI,
});
