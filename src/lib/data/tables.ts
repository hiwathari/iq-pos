import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, reservations, tables } from "@/db/schema";

// A table frees itself the moment its order is fully closed out (served + paid) so it can be
// checked back in right away — no one has to remember to clear it by hand. Run lazily whenever
// tables are listed rather than on a schedule, since there's no background job runner in this app.
const AUTO_RELEASE_DELAY_MS = 0;

async function releaseStaleTables(restaurantId: string) {
  const cutoff = Date.now() - AUTO_RELEASE_DELAY_MS;
  const onDineTables = await db
    .select({ id: tables.id, number: tables.number })
    .from(tables)
    .where(and(eq(tables.restaurantId, restaurantId), eq(tables.status, "on-dine")));
  if (onDineTables.length === 0) return;

  // A table gets reused many times over its life, so its *most recent* order is the only one
  // that matters here — an old, long-since-superseded order for the same table must never free
  // whatever party is sitting there right now. A table merged into someone else's order counts
  // that order as its latest one too (it has no order of its own while merged).
  const mergedOrders = await db
    .select({ merged: orders.mergedTableNumbers, closedOutAt: orders.closedOutAt, createdAt: orders.createdAt })
    .from(orders)
    .where(and(eq(orders.restaurantId, restaurantId), isNotNull(orders.mergedTableNumbers)))
    .orderBy(desc(orders.createdAt));
  await Promise.all(
    onDineTables.map(async (table) => {
      const [own] = await db
        .select({ closedOutAt: orders.closedOutAt, createdAt: orders.createdAt })
        .from(orders)
        .where(and(eq(orders.restaurantId, restaurantId), eq(orders.tableId, table.id)))
        .orderBy(desc(orders.createdAt))
        .limit(1);
      const viaMerge = mergedOrders.find((o) => o.merged?.includes(table.number));
      const latestOrder = viaMerge && (!own || viaMerge.createdAt > own.createdAt) ? viaMerge : own;
      if (latestOrder?.closedOutAt && latestOrder.closedOutAt < cutoff) {
        await db.update(tables).set({ status: "available", seated: 0, seatedAt: null }).where(eq(tables.id, table.id));
      }
    })
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
