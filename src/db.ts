import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { requireDatabaseUrl } from "./config";

let _db: PrismaClient | null = null;

function getDb(): PrismaClient {
  _db ??= new PrismaClient({
    adapter: new PrismaPg(
      {
        connectionString: requireDatabaseUrl(),
        connectionTimeoutMillis: 10_000,
        query_timeout: 20_000,
        idleTimeoutMillis: 30_000,
        max: 5,
      },
      { onPoolError: (err) => console.error("[pool]", err.message) },
    ),
  });
  return _db;
}

/// Lazy Prisma client: the adapter is only constructed on the first query,
/// so the server can boot (and serve /health) before DATABASE_URL exists.
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getDb();
    const value = (client as unknown as Record<PropertyKey, unknown>)[prop];
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export type DB = typeof db;