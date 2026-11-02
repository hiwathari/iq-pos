"use server";

import { and, desc, eq, like } from "drizzle-orm";
import { db } from "@/db/client";
import { dishes, orders, productVariants, serialNumbers } from "@/db/schema";
import { requireRestaurantContext } from "@/lib/scope";

// Serial / IMEI numbers (docs/retail-plan step 5.2). Receiving them is part of Goods in
// (receiveStockAction); selling them is part of placeOrderAction; these are the reads the Till
// and the serial lookup page need.

// Serials of a product (or one of its variants) still on the shelf.
export async function listAvailableSerialsAction(dishId: string, variantId?: string | null): Promise<string[]> {
  const { restaurantId } = await requireRestaurantContext();
  const rows = await db
    .select({ serial: serialNumbers.serial })
    .from(serialNumbers)
    .where(
      and(
        eq(serialNumbers.restaurantId, restaurantId),
        eq(serialNumbers.dishId, dishId),
        eq(serialNumbers.status, "in_stock"),
        variantId ? eq(serialNumbers.variantId, variantId) : undefined
      )
    )
    .orderBy(serialNumbers.receivedAt)
    .limit(300);
  return rows.map((r) => r.serial);
}

// A typed / scanned serial on the Till: is it in stock, and for which product.
export async function checkSerialAction(raw: string): Promise<{ serial?: string; dishId?: string; variantId?: string | null; error?: string }> {
  const { restaurantId } = await requireRestaurantContext();
  const serial = String(raw ?? "").trim();
  if (!serial) return { error: "Enter or scan the serial number." };
  const [row] = await db.select().from(serialNumbers).where(and(eq(serialNumbers.restaurantId, restaurantId), eq(serialNumbers.serial, serial))).limit(1);
  if (!row) return { error: `Serial ${serial} isn't in stock records.` };
  if (row.status !== "in_stock") return { error: `Serial ${serial} is ${row.status === "sold" ? "already sold" : row.status === "faulty" ? "marked faulty" : "not in stock"}.` };
  return { serial: row.serial, dishId: row.dishId, variantId: row.variantId };
}

export interface SerialInfo {
  serial: string;
  productName: string;
  status: string;
  orderNumber: string | null;
  orderId: string | null;
  receivedAt: number | null;
  soldAt: number | null;
}

// Search by (part of) a serial: where is it, when was it sold, to which order.
export async function searchSerialsAction(query: string): Promise<SerialInfo[]> {
  const { restaurantId } = await requireRestaurantContext();
  const q = String(query ?? "").trim();
  if (q.length < 3) return [];
  const rows = await db
    .select({
      serial: serialNumbers.serial,
      status: serialNumbers.status,
      orderId: serialNumbers.orderId,
      receivedAt: serialNumbers.receivedAt,
      soldAt: serialNumbers.soldAt,
      dishName: dishes.name,
      variantName: productVariants.name,
      orderNumber: orders.orderNumber,
    })
    .from(serialNumbers)
    .leftJoin(dishes, eq(dishes.id, serialNumbers.dishId))
    .leftJoin(productVariants, eq(productVariants.id, serialNumbers.variantId))
    .leftJoin(orders, eq(orders.id, serialNumbers.orderId))
    .where(and(eq(serialNumbers.restaurantId, restaurantId), like(serialNumbers.serial, `%${q.replace(/[%_]/g, "")}%`)))
    .orderBy(desc(serialNumbers.createdAt))
    .limit(50);
  return rows.map((r) => ({
    serial: r.serial,
    productName: r.variantName ? `${r.dishName ?? "Removed product"} — ${r.variantName}` : (r.dishName ?? "Removed product"),
    status: r.status,
    orderNumber: r.orderNumber,
    orderId: r.orderId,
    receivedAt: r.receivedAt,
    soldAt: r.soldAt,
  }));
}
