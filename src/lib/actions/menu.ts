"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { categories, dishes } from "@/db/schema";
import { assertPermission, requireRestaurantContext } from "@/lib/scope";
import type { CategoryDisplayOverride } from "@/lib/types";

export interface CreateCategoryInput {
  name: string;
  printerId: string | null;
  kitchenDisplayStation: CategoryDisplayOverride;
  taxRatePercent: number;
}

export async function createCategoryAction(input: CreateCategoryInput) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "manage-dishes");
  if (!input.name.trim()) return;
  await db.insert(categories).values({
    id: crypto.randomUUID(),
    restaurantId,
    name: input.name.trim(),
    icon: "all",
    printerId: input.printerId,
    kitchenDisplayStation: input.kitchenDisplayStation,
    taxRatePercent: input.taxRatePercent,
  });
  revalidatePath("/manage-dishes");
  revalidatePath("/order-line");
}

export interface UpdateCategoryInput {
  name: string;
  printerId: string | null;
  kitchenDisplayStation: CategoryDisplayOverride;
  taxRatePercent: number;
}

export async function updateCategoryAction(categoryId: string, input: UpdateCategoryInput) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "manage-dishes");
  if (!input.name.trim()) return;
  await db
    .update(categories)
    .set({
      name: input.name.trim(),
      printerId: input.printerId,
      kitchenDisplayStation: input.kitchenDisplayStation,
      taxRatePercent: input.taxRatePercent,
    })
    .where(and(eq(categories.id, categoryId), eq(categories.restaurantId, restaurantId)));
  revalidatePath("/manage-dishes");
  revalidatePath("/order-line");
}

export interface DishInput {
  name: string;
  categoryId: string;
  price: number;
  emoji: string;
  description: string;
  imageUrl?: string;
  printerId?: string | null;
  inventoryItemId?: string | null;
  inventoryUsagePerOrder?: number | null;
}

export async function createDishAction(input: DishInput) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "manage-dishes");
  await db.insert(dishes).values({
    id: crypto.randomUUID(),
    restaurantId,
    categoryId: input.categoryId,
    name: input.name,
    price: input.price,
    emoji: input.emoji,
    color: "#DCEEE8",
    description: input.description || null,
    imageUrl: input.imageUrl?.trim() || null,
    printerId: input.printerId ?? null,
    inventoryItemId: input.inventoryItemId || null,
    inventoryUsagePerOrder: input.inventoryItemId ? input.inventoryUsagePerOrder || null : null,
  });
  revalidatePath("/manage-dishes");
  revalidatePath("/order-line");
}

export async function updateDishAction(dishId: string, input: DishInput) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "manage-dishes");
  await db
    .update(dishes)
    .set({
      name: input.name,
      categoryId: input.categoryId,
      price: input.price,
      emoji: input.emoji,
      description: input.description || null,
      imageUrl: input.imageUrl?.trim() || null,
      printerId: input.printerId ?? null,
      inventoryItemId: input.inventoryItemId || null,
      inventoryUsagePerOrder: input.inventoryItemId ? input.inventoryUsagePerOrder || null : null,
    })
    .where(and(eq(dishes.id, dishId), eq(dishes.restaurantId, restaurantId)));
  revalidatePath("/manage-dishes");
  revalidatePath("/order-line");
}

export async function deleteDishAction(dishId: string) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "manage-dishes");
  await db.delete(dishes).where(and(eq(dishes.id, dishId), eq(dishes.restaurantId, restaurantId)));
  revalidatePath("/manage-dishes");
  revalidatePath("/order-line");
}

// Toggled from the Till or the Kitchen Display when an item runs out mid-service — deliberately
// not admin-only, since it's the floor/kitchen staff who notice and need to act immediately.
export async function setDishStockAction(dishId: string, outOfStock: boolean) {
  const { restaurantId } = await requireRestaurantContext();
  await db
    .update(dishes)
    .set({ outOfStock })
    .where(and(eq(dishes.id, dishId), eq(dishes.restaurantId, restaurantId)));
  revalidatePath("/order-line");
  revalidatePath("/kitchen");
  revalidatePath("/manage-dishes");
}

export async function setChannelPriceAction(dishId: string, channel: string, price: number | null) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "pricing");
  const [dish] = await db.select().from(dishes).where(and(eq(dishes.id, dishId), eq(dishes.restaurantId, restaurantId)));
  if (!dish) return;
  const next = { ...(dish.channelPrices ?? {}) };
  if (price === null || Number.isNaN(price)) delete next[channel];
  else next[channel] = price;
  await db
    .update(dishes)
    .set({ channelPrices: next })
    .where(and(eq(dishes.id, dishId), eq(dishes.restaurantId, restaurantId)));
  revalidatePath("/pricing");
  revalidatePath("/order-line");
}
