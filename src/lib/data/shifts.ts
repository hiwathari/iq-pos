import { and, desc, eq, gt, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, shifts } from "@/db/schema";
import { orderTotal, salesByTender } from "@/lib/types";

export async function listShifts(restaurantId: string) {
  return db.select().from(shifts).where(eq(shifts.restaurantId, restaurantId)).orderBy(desc(shifts.closedAt));
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

  const { cash: cashSales, card: cardSales, other: otherSales, byMethod } = salesByTender(liveOrders);

  const totalSales = cashSales + cardSales + otherSales;
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
    expectedCash: cashSales,
    terminalSales,
  };
}
