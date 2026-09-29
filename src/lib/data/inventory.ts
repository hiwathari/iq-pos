import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { inventoryItems } from "@/db/schema";

export async function listInventoryItems(restaurantId: string) {
  return db.select().from(inventoryItems).where(eq(inventoryItems.restaurantId, restaurantId)).orderBy(asc(inventoryItems.name));
}

export async function listLowStockItems(restaurantId: string) {
  const items = await listInventoryItems(restaurantId);
  return items.filter((i) => i.quantity <= i.lowStockThreshold);
}

export async function findInventoryItem(restaurantId: string, id: string) {
  const [item] = await db
    .select()
    .from(inventoryItems)
    .where(and(eq(inventoryItems.restaurantId, restaurantId), eq(inventoryItems.id, id)))
    .limit(1);
  return item ?? null;
}
