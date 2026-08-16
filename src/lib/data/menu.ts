import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { categories, dishes } from "@/db/schema";

export async function listCategories(restaurantId: string) {
  return db.select().from(categories).where(eq(categories.restaurantId, restaurantId));
}

export async function listDishes(restaurantId: string) {
  return db.select().from(dishes).where(eq(dishes.restaurantId, restaurantId));
}
