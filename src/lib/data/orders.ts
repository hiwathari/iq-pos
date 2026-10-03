import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, restaurants } from "@/db/schema";
import { AUTO_VOID_REASON, freeTableIfNoLiveOrders } from "@/lib/order-helpers";
import { businessDayStart } from "@/lib/business-day";

// There's no background job runner in this app, so — like releaseStaleTables in
// lib/data/tables.ts — this runs lazily on the next read rather than on a schedule. Any order
// still sitting unprocessed (never sent to kitchen, or never served) from a previous business day
// is stale: that day is over, so it's auto-voided and its table freed, and the Dashboard banner
// (driven by AUTO_VOID_REASON + restaurants.autoVoidNoticeDismissedAt) tells the manager what got
// cleared out overnight. The day boundary follows the restaurant's own opening time (see
// businessDayStart) rather than plain UTC midnight, so a shift running past midnight isn't
// treated as spanning two days.
async function autoVoidStaleOrders(restaurantId: string) {
  const [restaurant] = await db
    .select({ openTime: restaurants.openTime, timezone: restaurants.timezone })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);
  const dayStart = businessDayStart(Date.now(), restaurant?.openTime ?? null, restaurant?.timezone ?? "UTC");
  const stale = await db
    .select({ id: orders.id, tableId: orders.tableId })
    .from(orders)
    .where(
      and(
        eq(orders.restaurantId, restaurantId),
        inArray(orders.status, ["Wait List", "In Kitchen"]),
        lt(orders.createdAt, dayStart)
      )
    );
  if (stale.length === 0) return;

  const now = Date.now();
  await db
    .update(orders)
    .set({ status: "Voided", voidReason: AUTO_VOID_REASON, voidedAt: now })
    .where(
      inArray(
        orders.id,
        stale.map((o) => o.id)
      )
    );
  await Promise.all(
    stale.filter((o) => o.tableId).map((o) => freeTableIfNoLiveOrders(restaurantId, o.tableId!, o.id))
  );
}

export async function listOrders(restaurantId: string) {
  await autoVoidStaleOrders(restaurantId);
  return db.select().from(orders).where(eq(orders.restaurantId, restaurantId)).orderBy(desc(orders.createdAt));
}

// Order IDs are unguessable UUIDs, so this doubles as the public invoice page's access
// control — anyone with the link (or who scans the QR on their printed/emailed receipt) can view
// it, same trust model as a Stripe/PayPal receipt link, without a customer login.
export async function getOrderWithRestaurant(orderId: string) {
  const [row] = await db
    .select({ order: orders, restaurant: restaurants })
    .from(orders)
    .innerJoin(restaurants, eq(orders.restaurantId, restaurants.id))
    .where(eq(orders.id, orderId))
    .limit(1);
  return row ?? null;
}
