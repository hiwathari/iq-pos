import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { reservations, tables } from "@/db/schema";

export async function listTables(restaurantId: string) {
  return db.select().from(tables).where(eq(tables.restaurantId, restaurantId));
}

export async function listReservations(restaurantId: string) {
  return db
    .select()
    .from(reservations)
    .where(eq(reservations.restaurantId, restaurantId))
    .orderBy(desc(reservations.createdAt));
}
