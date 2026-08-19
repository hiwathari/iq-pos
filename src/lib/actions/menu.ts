"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { categories, dishes } from "@/db/schema";
import { assertAdmin, requireRestaurantContext } from "@/lib/scope";

export interface CreateCategoryInput {
  name: string;
  printerId: string | null;
  showOnKitchenDisplay: boolean;
}

export async function createCategoryAction(input: CreateCategoryInput) {
  const { session, restaurantId } = await requireRestaurantContext();
  assertAdmin(session);
  if (!input.name.trim()) return;
  await db.insert(categories).values({
    id: crypto.randomUUID(),
    restaurantId,
    name: input.name.trim(),
    icon: "all",
    printerId: input.printerId,
    showOnKitchenDisplay: input.showOnKitchenDisplay,
  });
  revalidatePath("/manage-dishes");
  revalidatePath("/order-line");
}

export interface DishInput {
  name: string;
  categoryId: string;
  price: number;
  emoji: string;
  description: string;
}

export async function createDishAction(input: DishInput) {
  const { session, restaurantId } = await requireRestaurantContext();
  assertAdmin(session);
  await db.insert(dishes).values({
    id: crypto.randomUUID(),
    restaurantId,
    categoryId: input.categoryId,
    name: input.name,
    price: input.price,
    emoji: input.emoji,
    color: "#DCEEE8",
    description: input.description || null,
  });
  revalidatePath("/manage-dishes");
  revalidatePath("/order-line");
}

export async function updateDishAction(dishId: string, input: DishInput) {
  const { session, restaurantId } = await requireRestaurantContext();
  assertAdmin(session);
  await db
    .update(dishes)
    .set({
      name: input.name,
      categoryId: input.categoryId,
      price: input.price,
      emoji: input.emoji,
      description: input.description || null,
    })
    .where(and(eq(dishes.id, dishId), eq(dishes.restaurantId, restaurantId)));
  revalidatePath("/manage-dishes");
  revalidatePath("/order-line");
}

export async function deleteDishAction(dishId: string) {
  const { session, restaurantId } = await requireRestaurantContext();
  assertAdmin(session);
  await db.delete(dishes).where(and(eq(dishes.id, dishId), eq(dishes.restaurantId, restaurantId)));
  revalidatePath("/manage-dishes");
  revalidatePath("/order-line");
}

export async function setChannelPriceAction(dishId: string, channel: string, price: number | null) {
  const { session, restaurantId } = await requireRestaurantContext();
  assertAdmin(session);
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
