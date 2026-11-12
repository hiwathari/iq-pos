import "server-only";
import { and, eq, inArray, lt, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, restaurants, tradeAccounts } from "@/db/schema";
import { businessDayStart } from "@/lib/business-day";
import { AUTO_VOID_REASON, freeOrderTables } from "@/lib/order-helpers";
import { releaseSerials, serialsOf } from "@/lib/data/serials";
import { restoreStoreCredits } from "@/lib/data/store-credit";
import { onAccountAmount } from "@/lib/data/trade-accounts";
import { returnStockForOrder } from "@/lib/stock";

// Voiding an order, in one place: store credit paid with it goes back, serial numbers are freed,
// a sale on account comes off the customer's balance, stock returns, and the table is freed.
// Used by the Till's Void button and by the sweeps below.
export async function voidOrderCore(restaurantId: string, orderId: string, reason: string, byName: string | null) {
  const [order] = await db
    .select({ id: orders.id, tableId: orders.tableId, mergedTableNumbers: orders.mergedTableNumbers, status: orders.status, items: orders.items, payments: orders.payments, paymentMethod: orders.paymentMethod, extraDiscount: orders.extraDiscount, couponDiscount: orders.couponDiscount, tradeAccountId: orders.tradeAccountId })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)))
    .limit(1);
  if (!order || order.status === "Voided") return false;
  const used = (order.payments ?? []).filter((p) => p.creditCode).map((p) => ({ code: p.creditCode!, amount: p.amount }));
  if (used.length) await restoreStoreCredits(restaurantId, used);
  await releaseSerials(restaurantId, serialsOf(order.items));
  const owed = onAccountAmount(order);
  if (order.tradeAccountId && owed > 0) await db.update(tradeAccounts).set({ balance: sql`round(${tradeAccounts.balance} - ${owed}, 2)` }).where(eq(tradeAccounts.id, order.tradeAccountId));
  await db
    .update(orders)
    .set({ status: "Voided", voidReason: reason || "No reason given", voidedAt: Date.now() })
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)));
  await returnStockForOrder(restaurantId, order, { byName, note: reason || null });
  await freeOrderTables(restaurantId, order, orderId);
  return true;
}

// Orders from before today's business day that were never paid and are still open — including ones
// already served but never paid. Paid orders are never touched here.
async function leftoverUnpaidOrderIds(restaurantId: string) {
  const [restaurant] = await db.select({ openTime: restaurants.openTime, timezone: restaurants.timezone }).from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1);
  const dayStart = businessDayStart(Date.now(), restaurant?.openTime ?? null, restaurant?.timezone ?? "UTC");
  const rows = await db
    .select({ id: orders.id, paymentMethod: orders.paymentMethod, payments: orders.payments })
    .from(orders)
    .where(and(eq(orders.restaurantId, restaurantId), ne(orders.status, "Voided"), inArray(orders.status, ["Pending", "Wait List", "In Kitchen", "Ready", "Served"]), lt(orders.createdAt, dayStart)));
  return rows.filter((o) => !o.paymentMethod && !(o.payments?.length)).map((o) => o.id);
}

// Run when the Till is opened and when the shift ends: every unpaid order left over from a
// previous day is voided (with the same reason the overnight sweep uses, so the Dashboard's
// "carried over from a previous day" notice lists them). Returns how many were voided.
export async function voidLeftoverOrders(restaurantId: string, byName: string | null) {
  const ids = await leftoverUnpaidOrderIds(restaurantId);
  let n = 0;
  for (const id of ids) if (await voidOrderCore(restaurantId, id, AUTO_VOID_REASON, byName)) n += 1;
  return n;
}
