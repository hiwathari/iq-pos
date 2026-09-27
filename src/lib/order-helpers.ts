import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { dishes, inventoryItems, orderCounters } from "@/db/schema";
import type { OrderItem } from "@/lib/types";

// Deliberately a plain server-only module (no "use server") — these helpers trust their
// restaurantId argument completely and must never become directly callable Server Actions.
// Only import them from other server-only code (a "use server" action file, a Server Component).

// 5-character order codes, base36-encoded from a per-restaurant counter. Deliberately not a
// plain incrementing decimal (so it doesn't read as "order #31 of the day"), but zero-padded
// base36 preserves numeric ordering character-by-character ('0'-'9' < 'A'-'Z' in ASCII too),
// so sorting the codes as strings reproduces the order they were placed in.
function encodeOrderNumber(counter: number) {
  return counter.toString(36).toUpperCase().padStart(5, "0");
}

export async function nextOrderNumber(restaurantId: string) {
  const [existing] = await db.select().from(orderCounters).where(eq(orderCounters.restaurantId, restaurantId)).limit(1);
  const next = (existing?.value ?? 30) + 1;
  if (existing) {
    await db.update(orderCounters).set({ value: next }).where(eq(orderCounters.restaurantId, restaurantId));
  } else {
    await db.insert(orderCounters).values({ restaurantId, value: next });
  }
  return encodeOrderNumber(next);
}

// Decrements stock for any dish in this order that's linked to a tracked inventory item — only
// called for brand-new orders (not edits), so an order's ingredients are consumed exactly once
// rather than needing delta-tracking across edits. Clamped at 0 via SQL MAX so a race between
// concurrent orders can't push a quantity negative.
export async function decrementInventoryForOrder(restaurantId: string, items: OrderItem[]) {
  const dishIds = [...new Set(items.map((i) => i.dishId))].filter((id) => !id.startsWith("custom:"));
  if (dishIds.length === 0) return;

  const linkedDishes = await db
    .select({ id: dishes.id, inventoryItemId: dishes.inventoryItemId, inventoryUsagePerOrder: dishes.inventoryUsagePerOrder })
    .from(dishes)
    .where(and(eq(dishes.restaurantId, restaurantId), inArray(dishes.id, dishIds)));

  const usageByInventoryItem = new Map<string, number>();
  for (const item of items) {
    const dish = linkedDishes.find((d) => d.id === item.dishId);
    if (!dish?.inventoryItemId || !dish.inventoryUsagePerOrder) continue;
    const amount = dish.inventoryUsagePerOrder * item.qty;
    usageByInventoryItem.set(dish.inventoryItemId, (usageByInventoryItem.get(dish.inventoryItemId) ?? 0) + amount);
  }

  for (const [inventoryItemId, amount] of usageByInventoryItem) {
    await db
      .update(inventoryItems)
      .set({ quantity: sql`max(${inventoryItems.quantity} - ${amount}, 0)` })
      .where(and(eq(inventoryItems.id, inventoryItemId), eq(inventoryItems.restaurantId, restaurantId)));
  }
}
