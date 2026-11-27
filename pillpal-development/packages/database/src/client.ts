import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client.js";

// Load root .env when present locally (no-op in Vercel production where env vars are injected)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, "../../../.env"),
});

function resolveDatabaseUrl(): string {
  return (process.env.DATABASE_URL || "").trim().replace(/^["']|["']$/g, "");
}

const globalForPrisma = globalThis as unknown as {
  pillpalPrisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  const connectionString = resolveDatabaseUrl();
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL environment variable");
  }
  const maxConnections = Number(process.env.DB_POOL_MAX || (process.env.VERCEL ? 5 : 10));
  const adapter = new PrismaPg({
    connectionString,
    max: Number.isFinite(maxConnections) && maxConnections > 0 ? maxConnections : 5,
  });
  return new PrismaClient({ adapter });
}

function getOrCreatePrismaClient(): PrismaClient {
  if (!globalForPrisma.pillpalPrisma) {
    globalForPrisma.pillpalPrisma = createPrismaClient();
  }
  return globalForPrisma.pillpalPrisma;
}

// Eagerly instantiate when DATABASE_URL is configured (normal runtime),
// or fall back to a lazy proxy when unset so non-DB routes like /health
// still respond cleanly with diagnostics instead of crashing module load.
export const prisma: PrismaClient = resolveDatabaseUrl()
  ? getOrCreatePrismaClient()
  : new Proxy({} as PrismaClient, {
      get(_target, prop) {
        const client = getOrCreatePrismaClient();
        const value = Reflect.get(client as object, prop, client);
        return typeof value === "function" ? value.bind(client) : value;
      },
    });

export * from "../generated/prisma/client.js";
