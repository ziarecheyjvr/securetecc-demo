import { readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { DEMO_SNAPSHOT_FILE, demoDatabaseUrl } from "@/lib/demo";

/**
 * Starts the demo database inside the app's own process -- how the demo runs
 * on Vercel, where there is no separate long-lived database process.
 *
 * Loads the snapshot `npm run build` wrote into an in-memory PGlite, serves it
 * on a free localhost port, and points DATABASE_URL at it before any Prisma
 * query runs. Each server instance therefore gets its own copy: changes made
 * during a demo last until that instance is recycled, then it starts fresh.
 */
export async function startInProcessDemoDb(): Promise<void> {
  const snapshot = await readFile(path.join(/*turbopackIgnore: true*/ process.cwd(), DEMO_SNAPSHOT_FILE));
  const db = await PGlite.create({
    loadDataDir: new File([snapshot], "snapshot.tar.gz", { type: "application/x-gzip" }),
  });

  // Port 0: the OS picks a free one, so nothing can collide with it.
  const server = new PGLiteSocketServer({ db, port: 0, host: "127.0.0.1" });
  await server.start();
  const port = Number(server.getServerConn().split(":").pop());

  process.env.DATABASE_URL = demoDatabaseUrl(port);
  process.env.DIRECT_URL = process.env.DATABASE_URL;
  // Belt and braces: whatever the deployment's environment says, the demo
  // never sends email or touches Google.
  process.env.SAFE_MODE = "1";
  console.log(`[demo-db] In-process PGlite ready on 127.0.0.1:${port}`);
}
