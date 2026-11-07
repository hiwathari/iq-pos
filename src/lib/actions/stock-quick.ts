"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { dishes, inventoryItems } from "@/db/schema";
import { requireRestaurantContext } from "@/lib/scope";
import { applyStockChanges } from "@/lib/stock";
import { stockUnitFor } from "@/lib/units";

// The quick stock count on the Kitchen Display and the Till ("Stock" panel): a number for each
// product with − / + and a typed amount. Deliberately NOT permission-gated beyond being signed in
// to the business — like marking an item out of stock (setDishStockAction), it's the floor and
// kitchen staff who notice what is left. It uses the same stock engine as everything else
// (applyStockChanges), so sales take it down automatically, and the change shows in the Stock
// page's history with who made it. A product nobody has counted stays uncounted ("normal"): its
// first +, or a typed number, is what starts counting it.
export interface QuickCountResult {
  error?: string;
  qty?: number;
  outOfStock?: boolean;
}

export async function setProductCountAction(
  dishId: string,
  change: { mode: "add"; amount: number } | { mode: "set"; amount: number },
  source: "kitchen" | "till"
): Promise<QuickCountResult> {
  const { session, restaurantId } = await requireRestaurantContext();
  const amount = Number(change?.amount);
  if (!Number.isFinite(amount) || Math.abs(amount) > 1e7) return { error: "Enter a number." };
  if (change.mode === "set" && amount < 0) return { error: "The count can't be below zero." };

  const [dish] = await db.select().from(dishes).where(and(eq(dishes.id, dishId), eq(dishes.restaurantId, restaurantId))).limit(1);
  if (!dish) return { error: "That product no longer exists." };
  if (dish.variantOptions && dish.variantOptions.length > 0) return { error: "This product has sizes or options — change their stock on the Stock page." };

  let [item] = await db
    .select()
    .from(inventoryItems)
    .where(and(eq(inventoryItems.restaurantId, restaurantId), eq(inventoryItems.dishId, dishId), isNull(inventoryItems.variantId)))
    .limit(1);
  // A dish drawing on an ingredient's stock keeps doing so — don't re-point it at a count of its own.
  if (!item && dish.inventoryItemId) return { error: "This item uses an ingredient's stock — count it on the Stock page." };

  const where = source === "kitchen" ? "Kitchen Display" : "Till";
  const before = item?.quantity ?? 0;
  const target = change.mode === "set" ? amount : before + amount;
  // Taking off more than is there is refused (a count can't go below zero by hand; sales may, per the
  // negative-stock setting). Checked before anything is created.
  if (target < -1e-9 && before + 1e-9 >= 0) return { error: before <= 1e-9 ? "There is none left to take off." : `Only ${before} in stock.` };
  let created = false;
  if (!item) {
    // First count: the product gets a stock item of its own, used 1 per unit sold (what the product
    // form's "Track stock" does).
    const [made] = await db
      .insert(inventoryItems)
      .values({
        restaurantId,
        name: await freeItemName(restaurantId, dish.name),
        unit: stockUnitFor(dish.sellBy, dish.unit),
        quantity: 0,
        lowStockThreshold: 0,
        dishId,
        costPrice: dish.costPrice,
        supplierId: dish.supplierId,
      })
      .returning();
    item = made;
    created = true;
    await db.update(dishes).set({ trackStock: true, inventoryItemId: made.id, inventoryUsagePerOrder: 1 }).where(eq(dishes.id, dishId));
  }

  const delta = Math.round((target - before) * 1e6) / 1e6;
  if (delta) {
    await applyStockChanges(restaurantId, new Map([[item.id, delta]]), {
      reason: created ? "opening" : "adjust",
      byName: session.name,
      note: created ? `Counted on the ${where}` : change.mode === "set" ? `Set to ${amount} on the ${where}` : `${delta > 0 ? "+" : ""}${delta} on the ${where}`,
      unitCosts: item.costPrice != null ? new Map([[item.id, item.costPrice]]) : undefined,
    });
  }
  const [after] = await db.select({ quantity: inventoryItems.quantity }).from(inventoryItems).where(eq(inventoryItems.id, item.id)).limit(1);
  const qty = after?.quantity ?? target;
  // A count of zero means sold out; stock back means it can be sold again.
  const outOfStock = qty <= 1e-9;
  if (outOfStock !== dish.outOfStock) await db.update(dishes).set({ outOfStock }).where(eq(dishes.id, dishId));

  revalidatePath("/kitchen");
  revalidatePath("/order-line");
  revalidatePath("/inventory");
  revalidatePath("/manage-dishes");
  return { qty, outOfStock };
}

async function freeItemName(restaurantId: string, name: string) {
  for (let n = 1; n < 50; n++) {
    const candidate = n === 1 ? name : `${name} (${n})`;
    const [hit] = await db
      .select({ id: inventoryItems.id })
      .from(inventoryItems)
      .where(and(eq(inventoryItems.restaurantId, restaurantId), eq(inventoryItems.name, candidate)))
      .limit(1);
    if (!hit) return candidate;
  }
  return `${name} (${crypto.randomUUID().slice(0, 4)})`;
}
