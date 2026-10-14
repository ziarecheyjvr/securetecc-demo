/**
 * Cron routes run unauthenticated (Vercel Cron doesn't carry a user session)
 * and touch every organization, so they must not be openly callable.
 *
 * Vercel signs scheduled invocations with `Authorization: Bearer $CRON_SECRET`
 * when that env var is set. Requests without it are rejected, which also
 * covers anyone who finds the URL.
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Fail closed: an unset secret means the endpoint is disabled, not open.
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export function unauthorizedResponse(): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}
