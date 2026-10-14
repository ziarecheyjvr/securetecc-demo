import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { DEMO_AUTH_COOKIE } from "@/lib/demo";
import { resolveObjectPath } from "@/lib/supabase/demo-storage";

const TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".txt": "text/plain; charset=utf-8",
};

// DEMO BUILD: serves files written by the local storage stand-in. This is
// what the "signed URLs" point at, so it requires a demo session the same way
// the staff app does.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bucket: string; path: string[] }> },
) {
  if (!request.cookies.get(DEMO_AUTH_COOKIE)) {
    return new NextResponse("Not signed in", { status: 401 });
  }
  const { bucket, path: segments } = await params;
  const full = await resolveObjectPath(bucket, segments.map(decodeURIComponent).join("/"));
  if (!full) return new NextResponse("Not found", { status: 404 });

  try {
    const bytes = await fs.readFile(full);
    const headers = new Headers({
      "content-type": TYPES[path.extname(full).toLowerCase()] ?? "application/octet-stream",
      "cache-control": "private, max-age=300",
    });
    const download = request.nextUrl.searchParams.get("download");
    if (download) {
      const name = download === "1" ? path.basename(full) : download;
      headers.set("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
    }
    return new NextResponse(bytes, { headers });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
