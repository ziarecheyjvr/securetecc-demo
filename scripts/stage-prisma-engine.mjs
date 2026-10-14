/**
 * Copies Prisma's native query-engine binaries one directory up, from
 * src/generated/prisma/ to src/generated/.
 *
 * Why: on Vercel, Prisma's runtime resolves the engine path against a
 * __dirname that Next.js's bundling shifts, so it looks in
 * /var/task/src/generated -- one level above where the generator actually
 * writes the binary (/var/task/src/generated/prisma). The binary ships
 * correctly (verified in the deployed Lambda); Prisma just doesn't look
 * where it lands. Neither outputFileTracingIncludes nor
 * serverExternalPackages changes that search path, so we satisfy it by
 * putting a copy on a path Prisma already searches.
 *
 * Runs from postinstall, i.e. before `next build`, so the copy exists when
 * file tracing runs (next.config.ts traces ./src/generated/**\/* ).
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatedDir = path.join(root, "src/generated");
const prismaDir = path.join(generatedDir, "prisma");

if (!existsSync(prismaDir)) {
  console.warn(`[stage-prisma-engine] ${prismaDir} not found -- skipping.`);
  process.exit(0);
}

mkdirSync(generatedDir, { recursive: true });

const engines = readdirSync(prismaDir).filter((f) => f.startsWith("libquery_engine-"));

if (engines.length === 0) {
  console.warn("[stage-prisma-engine] no libquery_engine-* binaries found -- skipping.");
  process.exit(0);
}

for (const engine of engines) {
  copyFileSync(path.join(prismaDir, engine), path.join(generatedDir, engine));
  console.log(`[stage-prisma-engine] staged ${engine} -> src/generated/`);
}
