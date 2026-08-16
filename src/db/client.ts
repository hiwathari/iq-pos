import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

// Lazily construct the client on first real query instead of at module load,
// so builds and pages that never touch the DB don't require env vars to be set.
let cached: Db | null = null;

function getDb(): Db {
  if (cached) return cached;
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) {
    throw new Error(
      "Missing TURSO_DATABASE_URL / TURSO_AUTH_TOKEN. Set them in .env.local (see .env.example)."
    );
  }
  const client = createClient({ url, authToken });
  cached = drizzle(client, { schema });
  return cached;
}

export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});
