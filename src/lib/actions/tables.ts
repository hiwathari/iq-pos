"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { reservations, tables } from "@/db/schema";
import type { ReservationSource, TableStatus } from "@/lib/types";
import { requireRestaurantContext } from "@/lib/scope";

export async function setTableStatusAction(tableId: string, status: TableStatus, seated?: number) {
  const { restaurantId } = await requireRestaurantContext();
  const patch: Partial<typeof tables.$inferInsert> = { status };
  if (seated !== undefined) patch.seated = seated;
  else if (status === "available") patch.seated = 0;
  await db
    .update(tables)
    .set(patch)
    .where(and(eq(tables.id, tableId), eq(tables.restaurantId, restaurantId)));
  revalidatePath("/manage-table");
  revalidatePath("/order-line");
  revalidatePath("/dashboard");
}

export interface ReservationInput {
  customerName: string;
  phone?: string;
  time: string;
  date: string;
  tableId: string | null;
  tableNumber: number | null;
  guests: number;
  meal: "Breakfast" | "Lunch" | "Dinner";
  source: ReservationSource;
}

export async function createReservationAction(input: ReservationInput) {
  const { restaurantId } = await requireRestaurantContext();
  await db.insert(reservations).values({
    id: crypto.randomUUID(),
    restaurantId,
    customerName: input.customerName,
    phone: input.phone || null,
    time: input.time,
    date: input.date,
    tableId: input.tableId,
    tableNumber: input.tableNumber,
    guests: input.guests,
    status: "upcoming",
    meal: input.meal,
    source: input.source,
  });
  if (input.tableId) {
    await db
      .update(tables)
      .set({ status: "reserved" })
      .where(and(eq(tables.id, input.tableId), eq(tables.restaurantId, restaurantId)));
  }
  revalidatePath("/manage-table");
}
