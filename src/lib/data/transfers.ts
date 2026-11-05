import "server-only";
import { desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db/client";
import { restaurants, stockTransfers } from "@/db/schema";

export async function listTransfersFor(restaurantId: string) {
  const rows = await db.select().from(stockTransfers).where(or(eq(stockTransfers.fromRestaurantId, restaurantId), eq(stockTransfers.toRestaurantId, restaurantId))).orderBy(desc(stockTransfers.createdAt));
  const ids = [...new Set(rows.flatMap((r) => [r.fromRestaurantId, r.toRestaurantId]))];
  const names = ids.length ? await db.select({ id: restaurants.id, name: restaurants.name }).from(restaurants).where(inArray(restaurants.id, ids)) : [];
  const name = new Map(names.map((n) => [n.id, n.name]));
  return rows.map((r) => ({ ...r, fromName: name.get(r.fromRestaurantId) ?? "Removed site", toName: name.get(r.toRestaurantId) ?? "Removed site", direction: r.fromRestaurantId === restaurantId ? ("out" as const) : ("in" as const) }));
}
