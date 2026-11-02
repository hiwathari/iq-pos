import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { purchaseOrderLines, purchaseOrders, suppliers } from "@/db/schema";

export async function listPurchaseOrders(restaurantId: string) {
  const [pos, sups, lines] = await Promise.all([
    db.select().from(purchaseOrders).where(eq(purchaseOrders.restaurantId, restaurantId)).orderBy(desc(purchaseOrders.createdAt)),
    db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).where(eq(suppliers.restaurantId, restaurantId)),
    db
      .select({ poId: purchaseOrderLines.purchaseOrderId, ordered: purchaseOrderLines.qtyOrdered, received: purchaseOrderLines.qtyReceived })
      .from(purchaseOrderLines)
      .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderLines.purchaseOrderId))
      .where(eq(purchaseOrders.restaurantId, restaurantId)),
  ]);
  const name = new Map(sups.map((s) => [s.id, s.name]));
  const count = new Map<string, number>();
  for (const l of lines) count.set(l.poId, (count.get(l.poId) ?? 0) + 1);
  return pos.map((p) => ({ ...p, supplierName: name.get(p.supplierId) ?? "Removed supplier", lineCount: count.get(p.id) ?? 0 }));
}

export async function getPurchaseOrder(restaurantId: string, id: string) {
  const [po] = await db.select().from(purchaseOrders).where(and(eq(purchaseOrders.restaurantId, restaurantId), eq(purchaseOrders.id, id))).limit(1);
  if (!po) return null;
  const lines = await db.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.purchaseOrderId, id));
  return { ...po, lines };
}
