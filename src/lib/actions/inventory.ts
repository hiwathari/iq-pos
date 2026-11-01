"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { inventoryItems } from "@/db/schema";
import { assertPermission, requireRestaurantContext } from "@/lib/scope";
import { findInventoryItem } from "@/lib/data/inventory";
import { applyStockChanges } from "@/lib/stock";

export interface InventoryItemInput {
  name: string;
  unit: string;
  quantity: number;
  lowStockThreshold: number;
}

export interface InventoryFormState {
  error?: string;
}

export async function createInventoryItemAction(input: InventoryItemInput): Promise<InventoryFormState> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "inventory");

  const name = input.name.trim();
  if (!name) return { error: "Enter an item name." };
  if (!Number.isFinite(input.quantity) || input.quantity < 0) return { error: "Enter a valid starting quantity." };

  // Created at 0 and filled through applyStockChanges, so the opening stock is in its history.
  const [created] = await db
    .insert(inventoryItems)
    .values({
      restaurantId,
      name,
      unit: input.unit.trim() || "pcs",
      quantity: 0,
      lowStockThreshold: Math.max(0, input.lowStockThreshold || 0),
    })
    .returning({ id: inventoryItems.id });
  await applyStockChanges(restaurantId, new Map([[created.id, input.quantity]]), { reason: "opening", byName: session.name });
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return {};
}

export async function updateInventoryItemAction(itemId: string, input: InventoryItemInput): Promise<InventoryFormState> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "inventory");

  const name = input.name.trim();
  if (!name) return { error: "Enter an item name." };

  await db
    .update(inventoryItems)
    .set({
      name,
      unit: input.unit.trim() || "pcs",
      lowStockThreshold: Math.max(0, input.lowStockThreshold || 0),
    })
    .where(and(eq(inventoryItems.id, itemId), eq(inventoryItems.restaurantId, restaurantId)));
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return {};
}

// A manual stock change (restock, waste, correction) — positive to add, negative to remove.
// Can't take more than is there (sales can, depending on the negative-stock setting; a person
// correcting stock by hand can't), but adding to a negative quantity is fine.
export async function adjustInventoryStockAction(itemId: string, delta: number): Promise<InventoryFormState> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "inventory");
  if (!Number.isFinite(delta) || delta === 0) return { error: "Enter a non-zero amount." };

  const item = await findInventoryItem(restaurantId, itemId);
  if (!item) return { error: "Item not found." };
  if (delta < 0 && item.quantity + delta < -1e-9) return { error: `Only ${Math.max(0, item.quantity)} ${item.unit} in stock.` };

  await applyStockChanges(restaurantId, new Map([[itemId, delta]]), { reason: delta > 0 ? "received" : "adjust", byName: session.name });
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return {};
}

export async function deleteInventoryItemAction(itemId: string) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "inventory");
  await db.delete(inventoryItems).where(and(eq(inventoryItems.id, itemId), eq(inventoryItems.restaurantId, restaurantId)));
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  revalidatePath("/manage-dishes");
}
