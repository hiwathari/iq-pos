import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { serialNumbers } from "@/db/schema";
import type { OrderItem } from "@/lib/types";

// Serial numbers sold on an order's lines (step 5.2).
export const serialsOf = (items: Pick<OrderItem, "serials">[]) => items.flatMap((i) => i.serials ?? []);

// Marks serials sold against an order. Each must belong to the line's product and be in stock;
// the update is conditional, so two tills can't both sell the same unit.
export async function sellSerials(restaurantId: string, orderId: string, items: Pick<OrderItem, "dishId" | "variantId" | "serials" | "name">[], alreadyOnOrder: Set<string>): Promise<{ error?: string }> {
  const taken: string[] = [];
  for (const item of items) {
    for (const serial of item.serials ?? []) {
      if (alreadyOnOrder.has(serial)) continue;
      const [row] = await db
        .update(serialNumbers)
        .set({ status: "sold", orderId, soldAt: Date.now() })
        .where(and(eq(serialNumbers.restaurantId, restaurantId), eq(serialNumbers.serial, serial), eq(serialNumbers.status, "in_stock"), eq(serialNumbers.dishId, item.dishId)))
        .returning({ serial: serialNumbers.serial });
      if (!row) {
        await releaseSerials(restaurantId, taken);
        return { error: `Serial ${serial} (${item.name}) isn't available — it may already be sold.` };
      }
      taken.push(serial);
    }
  }
  return {};
}

// Back on the shelf (a voided or edited-out sale).
export async function releaseSerials(restaurantId: string, serials: string[]) {
  if (serials.length === 0) return;
  await db
    .update(serialNumbers)
    .set({ status: "in_stock", orderId: null, soldAt: null })
    .where(and(eq(serialNumbers.restaurantId, restaurantId), inArray(serialNumbers.serial, serials)));
}
