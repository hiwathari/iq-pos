import { and, desc, eq, isNotNull, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, reservations, tables } from "@/db/schema";

// A table's order stays visible on the Till for a minute after it's fully closed out (served
// + paid) so staff can double-check it, then the table frees itself automatically — no one has
// to remember to clear it by hand. Run lazily whenever tables are listed rather than on a
// schedule, since there's no background job runner in this app.
const AUTO_RELEASE_DELAY_MS = 60_000;

async function releaseStaleTables(restaurantId: string) {
  const cutoff = Date.now() - AUTO_RELEASE_DELAY_MS;
  const stale = await db
    .select({ tableId: orders.tableId })
    .from(orders)
    .where(and(eq(orders.restaurantId, restaurantId), isNotNull(orders.closedOutAt), lt(orders.closedOutAt, cutoff)));

  const tableIds = [...new Set(stale.map((o) => o.tableId).filter((id): id is string => !!id))];
  await Promise.all(
    tableIds.map((tableId) =>
      db
        .update(tables)
        .set({ status: "available", seated: 0, seatedAt: null })
        .where(and(eq(tables.id, tableId), eq(tables.restaurantId, restaurantId), eq(tables.status, "on-dine")))
    )
  );
}

export async function listTables(restaurantId: string) {
  await releaseStaleTables(restaurantId);
  return db.select().from(tables).where(eq(tables.restaurantId, restaurantId));
}

export async function listReservations(restaurantId: string) {
  return db
    .select()
    .from(reservations)
    .where(eq(reservations.restaurantId, restaurantId))
    .orderBy(desc(reservations.createdAt));
}
