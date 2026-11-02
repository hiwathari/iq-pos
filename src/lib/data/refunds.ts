import { and, eq, gt, gte, lt, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { refunds } from "@/db/schema";

// Refunds made in a time window — they come off takings on the day they happen (End Day, the
// Till's "Today", Reports), not on the day of the original sale. docs/retail-plan step 3.7.
export async function listRefundsBetween(restaurantId: string, from: number, to: number, opts: { fromExclusive?: boolean; toInclusive?: boolean } = {}) {
  return db
    .select()
    .from(refunds)
    .where(
      and(
        eq(refunds.restaurantId, restaurantId),
        opts.fromExclusive ? gt(refunds.createdAt, from) : gte(refunds.createdAt, from),
        opts.toInclusive ? lte(refunds.createdAt, to) : lt(refunds.createdAt, to)
      )
    );
}

export async function listRefundsForOrder(restaurantId: string, orderId: string) {
  return db.select().from(refunds).where(and(eq(refunds.restaurantId, restaurantId), eq(refunds.orderId, orderId)));
}

// Cash vs card (anything not "Cash", including store credit later) totals of a set of refunds.
export function refundsByTender(list: { method: string; amount: number }[]) {
  let cash = 0;
  let card = 0;
  const byMethod = new Map<string, number>();
  for (const r of list) {
    if (r.method === "Cash") cash += r.amount;
    else card += r.amount;
    byMethod.set(r.method, (byMethod.get(r.method) ?? 0) + r.amount);
  }
  return { cash, card, total: cash + card, byMethod };
}
