"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { reservations, tables } from "@/db/schema";
import type { ReservationSource, TableArea, TableStatus } from "@/lib/types";
import { assertAdmin, requireRestaurantContext } from "@/lib/scope";

export interface CreateTableState {
  error?: string;
}

export async function createTableAction(
  _prevState: CreateTableState | undefined,
  formData: FormData
): Promise<CreateTableState> {
  const { session, restaurantId } = await requireRestaurantContext();
  assertAdmin(session);

  const number = Number(formData.get("number"));
  const area = String(formData.get("area") || "Ground Floor") as TableArea;
  const capacity = Math.max(1, Number(formData.get("capacity")) || 1);

  if (!Number.isInteger(number) || number <= 0) return { error: "Enter a valid table number." };

  const [existing] = await db
    .select({ id: tables.id })
    .from(tables)
    .where(and(eq(tables.restaurantId, restaurantId), eq(tables.number, number)))
    .limit(1);
  if (existing) return { error: `Table ${number} already exists.` };

  await db.insert(tables).values({ id: crypto.randomUUID(), restaurantId, number, area, capacity });
  revalidatePath("/manage-table");
  revalidatePath("/order-line");
  return {};
}

export async function deleteTableAction(tableId: string) {
  const { session, restaurantId } = await requireRestaurantContext();
  assertAdmin(session);
  await db.delete(tables).where(and(eq(tables.id, tableId), eq(tables.restaurantId, restaurantId)));
  revalidatePath("/manage-table");
  revalidatePath("/order-line");
}

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
