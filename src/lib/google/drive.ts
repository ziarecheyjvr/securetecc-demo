import { getGoogleAccessToken } from "./auth";

/**
 * Google Drive archiving for generated invoices.
 *
 * Target layout:
 *   SecureTECC Master Folder / SecureTECC Invoices / {Client} / {Year} / {INV}.pdf
 *                                                              / {INV}  (Sheet)
 *
 * Scope note: this needs the broad `drive` scope, not `drive.file`.
 * `drive.file` only grants access to files the app itself created, so it
 * cannot see a "SecureTECC Master Folder" that already exists in Tony's
 * Drive -- the find-or-create below would create a duplicate alongside it
 * every time instead of reusing it.
 */
const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

const FOLDER_MIME = "application/vnd.google-apps.folder";

/** Single-quotes are the string delimiter in Drive's query language. */
function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function driveFetch(url: string, init: RequestInit, token: string) {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Drive API ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

/**
 * Returns the id of the named child folder, creating it if absent.
 *
 * Deliberately not parallelised across the tree: each level needs its
 * parent's id before it can be queried, so the walk is inherently sequential.
 */
async function findOrCreateFolder(
  name: string,
  parentId: string | null,
  token: string,
): Promise<string> {
  const clauses = [
    `mimeType='${FOLDER_MIME}'`,
    `name='${escapeQueryValue(name)}'`,
    "trashed=false",
    parentId ? `'${escapeQueryValue(parentId)}' in parents` : "'root' in parents",
  ];
  const query = new URLSearchParams({
    q: clauses.join(" and "),
    fields: "files(id,name)",
    pageSize: "1",
  });

  const found = (await driveFetch(`${DRIVE_FILES}?${query}`, { method: "GET" }, token)) as {
    files?: { id: string }[];
  };
  if (found.files?.[0]) return found.files[0].id;

  const created = (await driveFetch(
    DRIVE_FILES,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        mimeType: FOLDER_MIME,
        ...(parentId ? { parents: [parentId] } : {}),
      }),
    },
    token,
  )) as { id: string };
  return created.id;
}

/**
 * Walks/creates SecureTECC Master Folder → SecureTECC Invoices → client → year and
 * returns the leaf folder id.
 *
 * GOOGLE_DRIVE_ROOT_FOLDER_ID lets you anchor to that root by id instead of
 * matching it by name -- safer, and immune to the folder being renamed.
 */
export async function ensureInvoiceFolder(
  clientName: string,
  year: number,
  token: string,
): Promise<string> {
  const configuredRoot = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  // Name must match the folder that actually exists in Tony's Drive
  // ("SecureTECC Master Folder", not "SecureTECC Master") -- getting this
  // wrong doesn't error, it silently creates a second root beside the real
  // one and archives every invoice into the wrong tree. Prefer anchoring by
  // id via GOOGLE_DRIVE_ROOT_FOLDER_ID; this name is only the fallback.
  const masterId =
    configuredRoot ?? (await findOrCreateFolder("SecureTECC Master Folder", null, token));
  const invoicesId = await findOrCreateFolder("SecureTECC Invoices", masterId, token);
  const clientId = await findOrCreateFolder(clientName, invoicesId, token);
  return findOrCreateFolder(String(year), clientId, token);
}

/**
 * Uploads bytes via Drive's multipart endpoint.
 *
 * Replaces an existing same-named file in the same folder rather than
 * accumulating "Invoice (1)", "Invoice (2)" duplicates when a PDF is
 * regenerated.
 */
export async function uploadToDrive(args: {
  name: string;
  mimeType: string;
  content: Buffer;
  folderId: string;
  token: string;
}): Promise<{ id: string; webViewLink: string }> {
  const existing = (await driveFetch(
    `${DRIVE_FILES}?${new URLSearchParams({
      q: `name='${escapeQueryValue(args.name)}' and '${escapeQueryValue(args.folderId)}' in parents and trashed=false`,
      fields: "files(id)",
      pageSize: "1",
    })}`,
    { method: "GET" },
    args.token,
  )) as { files?: { id: string }[] };
  const existingId = existing.files?.[0]?.id;

  const boundary = `drive_${Math.random().toString(36).slice(2)}`;
  const metadata = existingId
    ? {} // parents can't be changed on update; the file already lives there
    : { name: args.name, parents: [args.folderId] };

  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${args.mimeType}\r\n\r\n`,
      "utf8",
    ),
    args.content,
    Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
  ]);

  const url = existingId
    ? `${DRIVE_UPLOAD}/${existingId}?uploadType=multipart&fields=id,webViewLink`
    : `${DRIVE_UPLOAD}?uploadType=multipart&fields=id,webViewLink`;

  const uploaded = (await driveFetch(
    url,
    {
      method: existingId ? "PATCH" : "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body: body as unknown as BodyInit,
    },
    args.token,
  )) as { id: string; webViewLink?: string };

  return {
    id: uploaded.id,
    webViewLink: uploaded.webViewLink ?? `https://drive.google.com/file/d/${uploaded.id}/view`,
  };
}

/** Convenience wrapper that mints its own token. */
export async function getDriveToken(): Promise<string> {
  return getGoogleAccessToken(DRIVE_SCOPE);
}
