import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Some pooled Postgres providers (e.g. Neon's PgBouncer pooler) can hand back
// a connection whose session-level search_path was left in a non-default
// state by an unrelated client. Every connection this pool opens gets reset
// explicitly so unqualified table references always resolve to "public".
pool.on("connect", (client) => {
  client.query("SET search_path TO public").catch(() => {});
});

export const db = drizzle(pool, { schema });

export * from "./schema";
