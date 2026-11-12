"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { cleanIconValue } from "@/lib/icon-value";
import { floors, reservations, tables } from "@/db/schema";
import { DEFAULT_FLOOR, listFloors } from "@/lib/data/floors";
import type { ReservationSource, TableArea, TableStatus } from "@/lib/types";
import { assertPermission, requireRestaurantContext } from "@/lib/scope";

export interface CreateTableState {
  error?: string;
}

export async function createTableAction(
  _prevState: CreateTableState | undefined,
  formData: FormData
): Promise<CreateTableState> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "manage-table");

  const number = Number(formData.get("number"));
  const known = await listFloors(restaurantId);
  const asked = String(formData.get("area") || "").trim();
  const area: TableArea = known.includes(asked) ? asked : (known[0] ?? DEFAULT_FLOOR);
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

// ---- Floors ---------------------------------------------------------------------------------
// Adding and deleting floors is for the restaurant's admin (not staff). Moving a table between
// floors is table management, so it follows the Manage Table permission.
export interface FloorActionState {
  error?: string;
}

export async function createFloorAction(name: string, icon?: string | null): Promise<FloorActionState> {
  const { session, restaurantId } = await requireRestaurantContext();
  if (session.role === "staff" || session.role === "accounts") return { error: "Only the restaurant admin can add floors." };
  const clean = String(name ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
  if (!clean) return { error: "Enter a name for the floor." };
  const existing = await listFloors(restaurantId);
  if (existing.some((f) => f.toLowerCase() === clean.toLowerCase())) return { error: `There is already a floor called ${existing.find((f) => f.toLowerCase() === clean.toLowerCase())}.` };
  await db.insert(floors).values({ restaurantId, name: clean, sort: existing.length, icon: cleanIconValue(icon) });
  revalidatePath("/manage-table");
  revalidatePath("/order-line");
  return {};
}

// Changes (or clears) the icon on a floor's tab. Admin only, like adding and deleting floors.
export async function setFloorIconAction(name: string, icon: string | null): Promise<FloorActionState> {
  const { session, restaurantId } = await requireRestaurantContext();
  if (session.role === "staff" || session.role === "accounts") return { error: "Only the restaurant admin can change a floor's icon." };
  const existing = await listFloors(restaurantId);
  if (!existing.includes(name)) return { error: "That floor no longer exists." };
  const value = cleanIconValue(icon);
  const updated = await db.update(floors).set({ icon: value }).where(and(eq(floors.restaurantId, restaurantId), eq(floors.name, name))).returning({ id: floors.id });
  // A floor only known from its tables has no row yet — make one so the icon has somewhere to live.
  if (updated.length === 0) await db.insert(floors).values({ restaurantId, name, sort: existing.indexOf(name), icon: value }).onConflictDoNothing();
  revalidatePath("/manage-table");
  revalidatePath("/order-line");
  return {};
}

export async function deleteFloorAction(name: string): Promise<FloorActionState> {
  const { session, restaurantId } = await requireRestaurantContext();
  if (session.role === "staff" || session.role === "accounts") return { error: "Only the restaurant admin can delete floors." };
  const existing = await listFloors(restaurantId);
  if (!existing.includes(name)) return { error: "That floor no longer exists." };
  if (existing.length <= 1) return { error: "A restaurant needs at least one floor." };
  const onIt = await db.select({ id: tables.id }).from(tables).where(and(eq(tables.restaurantId, restaurantId), eq(tables.area, name)));
  if (onIt.length > 0) return { error: `${name} still has ${onIt.length} table${onIt.length === 1 ? "" : "s"} on it. Move or delete them first.` };
  await db.delete(floors).where(and(eq(floors.restaurantId, restaurantId), eq(floors.name, name)));
  revalidatePath("/manage-table");
  revalidatePath("/order-line");
  return {};
}

// A table changes floor; its number, seats, status and orders stay as they are.
export async function moveTableToFloorAction(tableId: string, floor: string): Promise<FloorActionState> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "manage-table");
  const existing = await listFloors(restaurantId);
  if (!existing.includes(floor)) return { error: "That floor doesn't exist." };
  await db.update(tables).set({ area: floor }).where(and(eq(tables.id, tableId), eq(tables.restaurantId, restaurantId)));
  revalidatePath("/manage-table");
  revalidatePath("/order-line");
  return {};
}

export async function deleteTableAction(tableId: string) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "manage-table");
  await db.delete(tables).where(and(eq(tables.id, tableId), eq(tables.restaurantId, restaurantId)));
  revalidatePath("/manage-table");
  revalidatePath("/order-line");
}

export async function setTableStatusAction(tableId: string, status: TableStatus, seated?: number) {
  const { restaurantId } = await requireRestaurantContext();
  const patch: Partial<typeof tables.$inferInsert> = { status };
  if (seated !== undefined) patch.seated = seated;
  else if (status === "available") patch.seated = 0;
  if (status === "on-dine") patch.seatedAt = Date.now();
  else if (status === "available") patch.seatedAt = null;
  await db
    .update(tables)
    .set(patch)
    .where(and(eq(tables.id, tableId), eq(tables.restaurantId, restaurantId)));
  revalidatePath("/manage-table");
  revalidatePath("/order-line");
  revalidatePath("/dashboard");
}

// Frees tables back to "available" in one go — the given ones, or every table in the restaurant
// when no ids are passed ("Free all tables"). Orders aren't touched: an open order on a freed
// table stays in Open Tickets until it's paid or voided.
export async function freeTablesAction(tableIds?: string[]) {
  const { restaurantId } = await requireRestaurantContext();
  if (tableIds && tableIds.length === 0) return;
  await db
    .update(tables)
    .set({ status: "available", seated: 0, seatedAt: null })
    .where(
      tableIds
        ? and(eq(tables.restaurantId, restaurantId), inArray(tables.id, tableIds.map(String)))
        : eq(tables.restaurantId, restaurantId)
    );
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
