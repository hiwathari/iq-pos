"use server";

import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, restaurants, shifts } from "@/db/schema";
import { assertAdmin, requireRestaurantContext } from "@/lib/scope";
import { summarizeShiftWindow } from "@/lib/data/shifts";

export interface EndShiftState {
  error?: string;
  shiftId?: string;
}

// Closes out the open-ended period since the last shift (or since the restaurant's very first
// order, for the first shift ever) and freezes its sales/cash numbers into a new shift row —
// the manager's day-end reconciliation, exported as a printable report right after.
export async function endShiftAction(cashCounted: number, notes: string): Promise<EndShiftState> {
  const { session, restaurantId } = await requireRestaurantContext();
  assertAdmin(session);

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

  const [shift] = await db
    .insert(shifts)
    .values({
      restaurantId,
      openedAt: sinceTs,
      closedAt: uptoTs,
      closedByUserId: session.userId,
      closedByName: session.name,
      notes: notes.trim() || null,
      cashCounted,
      ...summary,
    })
    .returning();

  return { shiftId: shift.id };
}
