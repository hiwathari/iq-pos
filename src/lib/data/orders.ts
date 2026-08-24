import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders } from "@/db/schema";

export async function listOrders(restaurantId: string) {
  return db.select().from(orders).where(eq(orders.restaurantId, restaurantId)).orderBy(desc(orders.createdAt));
}
