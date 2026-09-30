"use server";

import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, restaurants, shifts } from "@/db/schema";
import { assertPermission, requireRestaurantContext } from "@/lib/scope";
import { summarizeShiftWindow } from "@/lib/data/shifts";

export interface EndShiftState {
  error?: string;
  shiftId?: string;
}

export interface EndShiftInput {
  cashCounted: number;
  // What the manager counted/settled for each named payment method (Cash + every payment
  // terminal) — compared line-by-line on the report against this window's actual sales per
  // method, so a restaurant running several card machines gets each one reconciled separately.
  terminalCounts: { method: string; counted: number }[];
  cashExpenses: number;
  cardExpenses: number;
  notes: string;
}

// Closes out the open-ended period since the last shift (or since the restaurant's very first
// order, for the first shift ever) and freezes its sales/cash numbers into a new shift row —
// the day-end reconciliation, exported as a printable report right after. Available to any
// staff member with the end-day permission, not just admins — see lib/permissions.ts.
export async function endShiftAction(input: EndShiftInput): Promise<EndShiftState> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "end-day");

  const [previousShift] = await db
    .select({ closedAt: shifts.closedAt })
    .from(shifts)
    .where(eq(shifts.restaurantId, restaurantId))
    .orderBy(desc(shifts.closedAt))
    .limit(1);

  let sinceTs = previousShift?.closedAt ?? null;
  if (sinceTs === null) {
    // No prior shift — this is the restaurant's first one, so it should cover every order ever
    // placed. The window below is exclusive of `sinceTs`, so start it 1ms before the earliest
    // order (or the restaurant's creation time, if it has no orders yet) rather than at it.
    const [firstOrder] = await db
      .select({ createdAt: orders.createdAt })
      .from(orders)
      .where(eq(orders.restaurantId, restaurantId))
      .orderBy(asc(orders.createdAt))
      .limit(1);
    const [restaurant] = await db.select({ createdAt: restaurants.createdAt }).from(restaurants).where(eq(restaurants.id, restaurantId));
    sinceTs = (firstOrder?.createdAt ?? restaurant?.createdAt ?? Date.now()) - 1;
  }

  const uptoTs = Date.now();
  const summary = await summarizeShiftWindow(restaurantId, sinceTs, uptoTs);

  const cashExpenses = Math.max(0, input.cashExpenses || 0);
  const cardExpenses = Math.max(0, input.cardExpenses || 0);

  const [shift] = await db
    .insert(shifts)
    .values({
      restaurantId,
      openedAt: sinceTs,
      closedAt: uptoTs,
      closedByUserId: session.userId,
      closedByName: session.name,
      notes: input.notes.trim() || null,
      cashCounted: input.cashCounted,
      cashExpenses,
      cardExpenses,
      terminalCounts: input.terminalCounts,
      ...summary,
      // Expected cash accounts for cash that left the till as an expense during the shift.
      expectedCash: summary.expectedCash - cashExpenses,
    })
    .returning();

  return { shiftId: shift.id };
}
