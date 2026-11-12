import { and, desc, eq, gt, lte } from "drizzle-orm";
import { listRefundsBetween, refundsByTender } from "@/lib/data/refunds";
import { db } from "@/db/client";
import { orders, shifts } from "@/db/schema";
import { orderTotal, roundMoney, salesByTender } from "@/lib/types";

export async function listShifts(restaurantId: string) {
  return db.select().from(shifts).where(eq(shifts.restaurantId, restaurantId)).orderBy(desc(shifts.closedAt));
}

// When the most recent End Day happened (null if never): the Till's Tickets list lets finished
// orders from before it go to History.
export async function lastShiftClosedAt(restaurantId: string) {
  const [row] = await db.select({ closedAt: shifts.closedAt }).from(shifts).where(eq(shifts.restaurantId, restaurantId)).orderBy(desc(shifts.closedAt)).limit(1);
  return row?.closedAt ?? null;
}

export async function getShift(restaurantId: string, shiftId: string) {
  const [shift] = await db
    .select()
    .from(shifts)
    .where(and(eq(shifts.id, shiftId), eq(shifts.restaurantId, restaurantId)))
    .limit(1);
  return shift ?? null;
}

// Orders placed strictly after the previous shift close, up to and including this shift's
// close instant — so back-to-back shifts partition every order exactly once.
export async function summarizeShiftWindow(restaurantId: string, sinceTs: number, uptoTs: number) {
  const windowOrders = await db
    .select()
    .from(orders)
    .where(and(eq(orders.restaurantId, restaurantId), gt(orders.createdAt, sinceTs), lte(orders.createdAt, uptoTs)));

  const liveOrders = windowOrders.filter((o) => o.status !== "Voided");
  const voidedOrders = windowOrders.filter((o) => o.status === "Voided");

  const sales = salesByTender(liveOrders);
  // Refunds given during this shift come off what's expected in the drawer / on each card machine.
  const shiftRefunds = await listRefundsBetween(restaurantId, sinceTs, uptoTs, { fromExclusive: true, toInclusive: true });
  const refunded = refundsByTender(shiftRefunds);
  const cashSales = sales.cash - refunded.cash;
  const cardSales = sales.card - refunded.card;
  const otherSales = sales.other;
  const byMethod = new Map(sales.byMethod);
  for (const [method, amount] of refunded.byMethod) byMethod.set(method, (byMethod.get(method) ?? 0) - amount);

  const totalSales = cashSales + cardSales + otherSales + (sales.credit - refunded.credit);
  const voidAmount = voidedOrders.reduce((sum, o) => sum + orderTotal(o), 0);
  const terminalSales = [...byMethod.entries()].map(([method, amount]) => ({ method, amount }));

  return {
    totalSales,
    cashSales,
    cardSales,
    otherSales,
    orderCount: liveOrders.length,
    voidCount: voidedOrders.length,
    voidAmount,
    tipTotal: roundMoney(liveOrders.reduce((sum, o) => sum + (o.tip ?? 0), 0)),
    expectedCash: cashSales,
    terminalSales,
  };
}
