import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return drizzle(neon(url), { schema });
}

let db: ReturnType<typeof createDb> | null = null;

// Lazy so that `next build` does not need DATABASE_URL.
export function getDb() {
  if (!db) db = createDb();
  return db;
}
