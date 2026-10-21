import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { tables } from "@/db/schema";

// A table's QR code carries "<tableId>.<signature>" rather than a bare table number, so the table
// is fixed by the code itself: editing the URL to another table (or inventing one) fails the
// signature check, and a code only ever resolves to the one restaurant + table it was made for.
// The signature is an HMAC over both ids keyed by JWT_SECRET (already required for staff
// sessions), with a "table-qr:v1" prefix so it can never be confused with any other signed value.
// 22 base64url chars = 132 bits — far beyond guessing, while keeping the QR small enough to scan.

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error("Missing JWT_SECRET. Set it in .env.local (see .env.example).");
  return value;
}

function sign(restaurantId: string, tableId: string) {
  return createHmac("sha256", secret()).update(`table-qr:v1:${restaurantId}:${tableId}`).digest("base64url").slice(0, 22);
}

export function tableQrToken(restaurantId: string, tableId: string) {
  return `${tableId}.${sign(restaurantId, tableId)}`;
}

// Returns the table the token was signed for, or null for anything malformed, forged, or pointing
// at a table that's since been deleted.
export async function resolveTableQrToken(token: string) {
  const match = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]{22})$/.exec(token);
  if (!match) return null;
  const [, tableId, signature] = match;

  const [table] = await db.select().from(tables).where(eq(tables.id, tableId)).limit(1);
  if (!table) return null;

  const expected = Buffer.from(sign(table.restaurantId, table.id));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return table;
}
