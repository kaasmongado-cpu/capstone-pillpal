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

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Missing DATABASE_URL");
}

const globalForPrisma = globalThis as unknown as {
  pillpalPrisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  const maxConnections = Number(process.env.DB_POOL_MAX || (process.env.VERCEL ? 5 : 10));
  const adapter = new PrismaPg({
    connectionString,
    max: Number.isFinite(maxConnections) && maxConnections > 0 ? maxConnections : 5,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.pillpalPrisma ?? createPrismaClient();

if (!globalForPrisma.pillpalPrisma) {
  globalForPrisma.pillpalPrisma = prisma;
}

export * from "../generated/prisma/client.js";
