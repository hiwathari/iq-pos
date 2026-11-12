import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { floors, tables } from "@/db/schema";

export const DEFAULT_FLOOR = "Ground Floor";

// A restaurant's floors, in order. "Ground Floor" is created the first time it is needed (every new
// restaurant gets it that way), and a floor that tables already sit on is always listed even if it
// was never added by name — so no table can ever be hidden.
export async function listFloors(restaurantId: string): Promise<string[]> {
  const rows = await db.select({ name: floors.name }).from(floors).where(eq(floors.restaurantId, restaurantId)).orderBy(asc(floors.sort), asc(floors.createdAt));
  let names = rows.map((r) => r.name);
  if (names.length === 0) {
    await db.insert(floors).values({ restaurantId, name: DEFAULT_FLOOR, sort: 0 }).onConflictDoNothing();
    names = [DEFAULT_FLOOR];
  }
  const used = await db.select({ area: tables.area }).from(tables).where(eq(tables.restaurantId, restaurantId));
  for (const u of used) if (!names.includes(u.area)) names.push(u.area);
  return names;
}
