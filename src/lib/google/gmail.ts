import { getGoogleAccessToken } from "./auth";
import { buildMimeMessage, toBase64Url, type MimeMessage } from "./mime";

const DRAFTS_URL = "https://gmail.googleapis.com/gmail/v1/users/me/drafts";

export type CreatedDraft = {
  draftId: string;
  /** Deep link straight to the draft in Gmail's web UI. */
  url: string;
};

/**
 * Creates a Gmail DRAFT (never sends).
 *
 * The whole point of this path is that a human reviews every invoice before
 * it reaches a client, so there is deliberately no send() here -- adding one
 * would quietly defeat the review step. Tony sends from Gmail; the app then
 * records that via a separate "Mark as sent" action.
 */
export async function createGmailDraft(
  message: MimeMessage,
  /**
   * Existing draft to overwrite. Passing this makes the operation idempotent:
   * clicking the button twice updates one draft rather than leaving two
   * identical invoices sitting in the mailbox. Ignored (and a new draft
   * created) if Gmail no longer has it -- the usual reason being that someone
   * deleted or already sent it.
   */
  existingDraftId?: string | null,
): Promise<CreatedDraft> {
  const accessToken = await getGoogleAccessToken();
  const raw = toBase64Url(buildMimeMessage(message));

  const send = (method: "POST" | "PUT", url: string) =>
    fetch(url, {
      method,
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { raw } }),
      signal: AbortSignal.timeout(30_000),
    });

  let response = existingDraftId
    ? await send("PUT", `${DRAFTS_URL}/${existingDraftId}`)
    : await send("POST", DRAFTS_URL);

  // A stale id (draft deleted or already sent) 404s. Fall back to creating a
  // fresh draft rather than failing the whole action.
  if (existingDraftId && response.status === 404) {
    response = await send("POST", DRAFTS_URL);
  }

  if (!response.ok) {
    throw new Error(`Gmail draft creation failed (${response.status}): ${await response.text()}`);
  }

  const draft = (await response.json()) as { id?: string };
  if (!draft.id) throw new Error("Gmail returned no draft id.");

  return { draftId: draft.id, url: `https://mail.google.com/mail/u/0/#drafts?compose=${draft.id}` };
}
