"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { inventoryItems } from "@/db/schema";
import { assertPermission, requireRestaurantContext } from "@/lib/scope";
import { findInventoryItem } from "@/lib/data/inventory";

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

  await db.insert(inventoryItems).values({
    restaurantId,
    name,
    unit: input.unit.trim() || "pcs",
    quantity: input.quantity,
    lowStockThreshold: Math.max(0, input.lowStockThreshold || 0),
  });
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
// Clamped so quantity never reads negative on the UI.
export async function adjustInventoryStockAction(itemId: string, delta: number): Promise<InventoryFormState> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "inventory");
  if (!Number.isFinite(delta) || delta === 0) return { error: "Enter a non-zero amount." };

  const item = await findInventoryItem(restaurantId, itemId);
  if (!item) return { error: "Item not found." };

  const quantity = Math.max(0, item.quantity + delta);
  await db.update(inventoryItems).set({ quantity }).where(and(eq(inventoryItems.id, itemId), eq(inventoryItems.restaurantId, restaurantId)));
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
