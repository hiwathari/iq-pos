import { and, desc, eq, gt, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, shifts } from "@/db/schema";
import { orderTotal } from "@/lib/types";

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

  let cashSales = 0;
  let cardSales = 0;
  let otherSales = 0;
  const byMethod = new Map<string, number>();

  for (const o of liveOrders) {
    const total = orderTotal(o);
    const methodLines = o.payments?.length ? o.payments : o.paymentMethod ? [{ method: o.paymentMethod, amount: total }] : [];
    if (methodLines.length === 0) {
      otherSales += total;
      continue;
    }
    for (const line of methodLines) {
      if (line.method === "Cash") cashSales += line.amount;
      else cardSales += line.amount;
      byMethod.set(line.method, (byMethod.get(line.method) ?? 0) + line.amount);
    }
  }

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
