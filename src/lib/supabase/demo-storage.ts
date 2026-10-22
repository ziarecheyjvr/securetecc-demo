import { DEMO_STORAGE_DIR } from "@/lib/demo";

/**
 * A local-disk stand-in for Supabase Storage, shaped like the subset of the
 * supabase-js storage API the app calls: upload, download, move, remove and
 * createSignedUrl. Signed URLs point at /api/demo-storage, which serves the
 * file back. Server-only.
 *
 * Node modules are loaded inside each call rather than at the top: a client
 * component (profile-form) imports a constant from lib/storage/avatars, which
 * pulls this file into the browser graph, and a top-level node:fs import
 * there fails the build.
 */

const node = async () => ({
  fs: (await import("node:fs")).promises,
  path: (await import("node:path")).default,
});

type Result<T> = Promise<{ data: T | null; error: { message: string } | null }>;

/** Resolves a bucket/object path, refusing anything that escapes the root. */
export async function resolveObjectPath(bucket: string, objectPath: string): Promise<string | null> {
  const { path } = await node();
  const base = path.resolve(/*turbopackIgnore: true*/ process.cwd(), DEMO_STORAGE_DIR);
  const full = path.resolve(base, bucket, objectPath);
  return full.startsWith(base + path.sep) ? full : null;
}

function bucketApi(bucket: string) {
  return {
    async upload(objectPath: string, body: Buffer | Uint8Array | Blob | ArrayBuffer, opts?: { upsert?: boolean; contentType?: string }): Result<{ path: string }> {
      const { fs, path } = await node();
      const full = await resolveObjectPath(bucket, objectPath);
      if (!full) return { data: null, error: { message: "Invalid path" } };
      if (!opts?.upsert) {
        const exists = await fs.stat(full).then(() => true, () => false);
        if (exists) return { data: null, error: { message: "The resource already exists" } };
      }
      const bytes =
        body instanceof Blob ? Buffer.from(await body.arrayBuffer()) : Buffer.from(body as Uint8Array);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, bytes);
      return { data: { path: objectPath }, error: null };
    },

    async download(objectPath: string): Result<Blob> {
      const { fs } = await node();
      const full = await resolveObjectPath(bucket, objectPath);
      if (!full) return { data: null, error: { message: "Invalid path" } };
      try {
        return { data: new Blob([await fs.readFile(full)]), error: null };
      } catch {
        return { data: null, error: { message: "Object not found" } };
      }
    },

    async move(from: string, to: string): Result<{ message: string }> {
      const { fs, path } = await node();
      const src = await resolveObjectPath(bucket, from);
      const dest = await resolveObjectPath(bucket, to);
      if (!src || !dest) return { data: null, error: { message: "Invalid path" } };
      try {
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.rename(src, dest);
        return { data: { message: "Moved" }, error: null };
      } catch {
        return { data: null, error: { message: "Object not found" } };
      }
    },

    async remove(paths: string[]): Result<unknown[]> {
      const { fs } = await node();
      for (const p of paths) {
        const full = await resolveObjectPath(bucket, p);
        if (full) await fs.rm(full, { force: true });
      }
      return { data: [], error: null };
    },

    async createSignedUrl(objectPath: string, _expiresIn?: number, opts?: { download?: string | boolean }): Result<{ signedUrl: string }> {
      const { fs } = await node();
      const full = await resolveObjectPath(bucket, objectPath);
      if (!full) return { data: null, error: { message: "Invalid path" } };
      const exists = await fs.stat(full).then(() => true, () => false);
      if (!exists) return { data: null, error: { message: "Object not found" } };
      // Relative: every caller hands this to the browser, and it keeps working
      // whichever port the dev server lands on.
      let url = `/api/demo-storage/${bucket}/${objectPath.split("/").map(encodeURIComponent).join("/")}`;
      if (opts?.download) {
        url += `?download=${encodeURIComponent(typeof opts.download === "string" ? opts.download : "1")}`;
      }
      return { data: { signedUrl: url }, error: null };
    },
  };
}

export const demoStorage = {
  from: bucketApi,
};
