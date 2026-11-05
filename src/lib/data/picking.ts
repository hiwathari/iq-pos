import { and, desc, eq, gte, inArray, isNull, ne, or } from "drizzle-orm";
import { db } from "@/db/client";
import { dishes, orders, productVariants } from "@/db/schema";
import { levelsForItems } from "@/lib/data/locations";
import type { OrderItem } from "@/lib/types";

// Orders waiting to be picked, packed and sent (docs/retail-plan steps 6.3–6.4): delivery and
// click & collect orders that aren't voided, pending acceptance or already dispatched. Each line
// carries the bins it can be picked from, and lines are listed in walking order.
export interface PickLine {
  item: OrderItem;
  bins: { code: string; quantity: number }[];
  walk: number;
}

export interface PickOrder {
  id: string;
  orderNumber: string;
  channel: string;
  createdAt: number;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  pickStatus: "picking" | "packed" | "dispatched" | null;
  carrier: string | null;
  tracking: string | null;
  lines: PickLine[];
}

export async function listPickOrders(restaurantId: string): Promise<PickOrder[]> {
  const since = Date.now() - 30 * 86400000;
  const rows = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.restaurantId, restaurantId),
        gte(orders.createdAt, since),
        ne(orders.status, "Voided"),
        ne(orders.status, "Pending"),
        inArray(orders.channel, ["Delivery", "Click & collect"]),
        or(isNull(orders.pickStatus), ne(orders.pickStatus, "dispatched"))
      )
    )
    .orderBy(desc(orders.createdAt));
  if (rows.length === 0) return [];
  const dishIds = [...new Set(rows.flatMap((o) => o.items.map((i) => i.dishId)))].filter((d) => !d.startsWith("custom:"));
  const dishRows = dishIds.length ? await db.select({ id: dishes.id, itemId: dishes.inventoryItemId }).from(dishes).where(and(eq(dishes.restaurantId, restaurantId), inArray(dishes.id, dishIds))) : [];
  const variantIds = [...new Set(rows.flatMap((o) => o.items.map((i) => i.variantId)).filter((v): v is string => !!v))];
  const variantRows = variantIds.length ? await db.select({ id: productVariants.id, itemId: productVariants.inventoryItemId }).from(productVariants).where(inArray(productVariants.id, variantIds)) : [];
  const dishItem = new Map(dishRows.map((d) => [d.id, d.itemId]));
  const variantItem = new Map(variantRows.map((v) => [v.id, v.itemId]));
  const itemIds = [...new Set([...dishItem.values(), ...variantItem.values()].filter((x): x is string => !!x))];
  const levels = await levelsForItems(restaurantId, itemIds);

  return rows.map((o) => {
    const lines: PickLine[] = o.items.map((item) => {
      const stockId = (item.variantId ? variantItem.get(item.variantId) : dishItem.get(item.dishId)) ?? null;
      const bins = (stockId ? (levels.get(stockId) ?? []) : []).filter((l) => l.pickable && l.quantity > 0);
      return { item, bins: bins.map((b) => ({ code: b.code, quantity: b.quantity })), walk: bins.length ? bins[0].sort : 1e9 };
    });
    lines.sort((a, b) => a.walk - b.walk || (a.bins[0]?.code ?? "").localeCompare(b.bins[0]?.code ?? "") || a.item.name.localeCompare(b.item.name));
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      channel: o.channel,
      createdAt: o.createdAt,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      customerAddress: o.customerAddress,
      pickStatus: o.pickStatus,
      carrier: o.carrier,
      tracking: o.tracking,
      lines,
    };
  });
}
