import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { dishes, inventoryItems, purchaseOrders, suppliers } from "@/db/schema";

export async function listSuppliers(restaurantId: string) {
  return db.select().from(suppliers).where(eq(suppliers.restaurantId, restaurantId)).orderBy(asc(suppliers.name));
}

export async function getSupplier(restaurantId: string, id: string) {
  const [row] = await db.select().from(suppliers).where(and(eq(suppliers.restaurantId, restaurantId), eq(suppliers.id, id))).limit(1);
  return row ?? null;
}

// Suppliers with how many stock items they supply and how many orders are still open.
export async function listSuppliersWithCounts(restaurantId: string) {
  const [rows, itemCounts, dishCounts, openPos] = await Promise.all([
    listSuppliers(restaurantId),
    db
      .select({ supplierId: inventoryItems.supplierId, n: sql<number>`count(*)` })
      .from(inventoryItems)
      .where(and(eq(inventoryItems.restaurantId, restaurantId), sql`${inventoryItems.supplierId} is not null`, sql`${inventoryItems.dishId} is null`))
      .groupBy(inventoryItems.supplierId),
    db
      .select({ supplierId: dishes.supplierId, n: sql<number>`count(*)` })
      .from(dishes)
      .where(and(eq(dishes.restaurantId, restaurantId), sql`${dishes.supplierId} is not null`))
      .groupBy(dishes.supplierId),
    db
      .select({ supplierId: purchaseOrders.supplierId, n: sql<number>`count(*)` })
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.restaurantId, restaurantId), inArray(purchaseOrders.status, ["draft", "sent", "part_received"])))
      .groupBy(purchaseOrders.supplierId),
  ]);
  const n = (list: { supplierId: string | null; n: number }[]) => new Map(list.map((r) => [r.supplierId, Number(r.n)]));
  const items = n(itemCounts);
  const prods = n(dishCounts);
  const open = n(openPos);
  return rows.map((s) => ({ ...s, itemCount: (items.get(s.id) ?? 0) + (prods.get(s.id) ?? 0), openOrders: open.get(s.id) ?? 0 }));
}

export async function listPurchaseOrdersForSupplier(restaurantId: string, supplierId: string) {
  return db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.restaurantId, restaurantId), eq(purchaseOrders.supplierId, supplierId)))
    .orderBy(desc(purchaseOrders.createdAt))
    .limit(20);
}
