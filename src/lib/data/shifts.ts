import { and, asc, desc, eq, gt, lte } from "drizzle-orm";
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

// Where the next shift's window picks up: right after the last shift closed, or — for a
// restaurant's very first shift ever — just before its earliest order (or its creation time, if
// it has none yet). Shared by the real close (endShiftAction) and the live, non-committing
// preview so the two can never disagree about which orders are "today's".
export async function resolveShiftWindowStart(restaurantId: string, restaurantCreatedAt: number) {
  const [previousShift] = await db
    .select({ closedAt: shifts.closedAt })
    .from(shifts)
    .where(eq(shifts.restaurantId, restaurantId))
    .orderBy(desc(shifts.closedAt))
    .limit(1);
  if (previousShift?.closedAt != null) return previousShift.closedAt;

  const [firstOrder] = await db
    .select({ createdAt: orders.createdAt })
    .from(orders)
    .where(eq(orders.restaurantId, restaurantId))
    .orderBy(asc(orders.createdAt))
    .limit(1);
  return (firstOrder?.createdAt ?? restaurantCreatedAt) - 1;
}

export interface ShiftIssue {
  orderId: string;
  orderNumber: string;
  tableNumber: number | null;
  label: string;
}

// Things worth flagging before closing the day: an order still mid-flight (never served) and an
// order that was served without ever taking payment — both mean the day's numbers aren't final
// yet, so they're surfaced as "errors" on the End Day preview rather than silently rolled in.
export async function findShiftIssues(restaurantId: string, sinceTs: number, uptoTs: number): Promise<ShiftIssue[]> {
  const windowOrders = await db
    .select()
    .from(orders)
    .where(and(eq(orders.restaurantId, restaurantId), gt(orders.createdAt, sinceTs), lte(orders.createdAt, uptoTs)));

  const issues: ShiftIssue[] = [];
  for (const o of windowOrders) {
    if (o.status === "Voided") continue;
    if (o.status !== "Served") {
      issues.push({ orderId: o.id, orderNumber: o.orderNumber, tableNumber: o.tableNumber, label: `Still ${o.status.toLowerCase()} — never served` });
    } else if (!o.paymentMethod) {
      issues.push({ orderId: o.id, orderNumber: o.orderNumber, tableNumber: o.tableNumber, label: "Served but no payment was taken" });
    }
  }
  return issues;
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
