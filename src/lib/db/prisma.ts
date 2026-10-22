import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// DEMO BUILD: cached on globalThis in production too, not just in dev. A
// production build loads this module separately for route handlers and for
// pages, and each copy would open its own connection -- but PGlite serves one
// connection at a time, so the second client queues until it times out
// ("Can't reach database server"). One client per process keeps it at one.
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
globalForPrisma.prisma = prisma;
