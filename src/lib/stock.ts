import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { dishes, inventoryItems, restaurants, stockMovements } from "@/db/schema";
import type { OrderItem, OrderStatus } from "@/lib/types";

// The one place stock quantities change. Every change updates inventory_items.quantity and
// writes a stock_movements row saying why (sale, void, edit, adjust…), by whom and for which
// order — the stock history and the source for stock reports. Like order-helpers.ts this is a
// plain server-only module: it trusts its restaurantId and must only be called from server code
// that has already checked the session.

export type StockReason =
  | "sale"
  | "void"
  | "edit"
  | "refund"
  | "received"
  | "adjust"
  | "count"
  | "waste"
  | "transfer_in"
  | "transfer_out"
  | "opening";

export type NegativeStockMode = "allow" | "warn" | "block";

export interface StockChangeOptions {
  reason: StockReason;
  referenceId?: string | null;
  byName?: string | null;
  note?: string | null;
  // Cost per unit for each item, recorded on the movement (goods in, stocktake) so stock history
  // and loss reports can value it.
  unitCosts?: Map<string, number>;
}

// changes: inventory item id → signed amount (+ in, − out). Zero entries are skipped.
export async function applyStockChanges(restaurantId: string, changes: Map<string, number>, opts: StockChangeOptions) {
  for (const [inventoryItemId, rawChange] of changes) {
    // Six decimals is plenty for any unit and drops float noise like 0.20000000000000007.
    const change = Math.round(rawChange * 1e6) / 1e6;
    if (!change || !Number.isFinite(change)) continue;
    const [updated] = await db
      .update(inventoryItems)
      .set({ quantity: sql`round(${inventoryItems.quantity} + ${change}, 3)` })
      .where(and(eq(inventoryItems.id, inventoryItemId), eq(inventoryItems.restaurantId, restaurantId)))
      .returning({ quantity: inventoryItems.quantity });
    if (!updated) continue;
    await db.insert(stockMovements).values({
      restaurantId,
      inventoryItemId,
      change,
      quantityAfter: updated.quantity,
      reason: opts.reason,
      referenceId: opts.referenceId ?? null,
      note: opts.note ?? null,
      unitCost: opts.unitCosts?.get(inventoryItemId) ?? null,
      createdByName: opts.byName ?? null,
    });
  }
}

// How much of each stock item these order lines use: dish → linked inventory item ×
// usage-per-order × qty. Custom ("custom:…") lines and dishes without a link use nothing.
export async function stockUsageForItems(restaurantId: string, items: Pick<OrderItem, "dishId" | "qty">[]) {
  const usage = new Map<string, number>();
  const dishIds = [...new Set(items.map((i) => i.dishId))].filter((id) => !id.startsWith("custom:"));
  if (dishIds.length === 0) return usage;
  const linked = await db
    .select({ id: dishes.id, inventoryItemId: dishes.inventoryItemId, perOrder: dishes.inventoryUsagePerOrder })
    .from(dishes)
    .where(and(eq(dishes.restaurantId, restaurantId), inArray(dishes.id, dishIds)));
  for (const item of items) {
    const dish = linked.find((d) => d.id === item.dishId);
    if (!dish?.inventoryItemId || !dish.perOrder) continue;
    usage.set(dish.inventoryItemId, (usage.get(dish.inventoryItemId) ?? 0) + dish.perOrder * item.qty);
  }
  return usage;
}

const negate = (m: Map<string, number>) => new Map([...m].map(([k, v]) => [k, -v] as const));

// A new order (or an accepted online one) takes its stock.
export async function takeStockForOrder(restaurantId: string, orderId: string, items: OrderItem[], byName?: string | null) {
  const usage = await stockUsageForItems(restaurantId, items);
  await applyStockChanges(restaurantId, negate(usage), { reason: "sale", referenceId: orderId, byName });
}

// A voided / deleted order gives its stock back — once, and exactly what it took: the sum of
// its own sale/edit movements (so a dish linked to stock after the sale gives nothing back).
// Orders placed before the movement log existed have none, so for them it falls back to what
// their items use now. Skipped for orders that never took stock — a "Pending" customer order
// (taken on accept) — and for ones already voided.
export async function returnStockForOrder(
  restaurantId: string,
  order: { id: string; status: OrderStatus; items: OrderItem[] },
  opts: { byName?: string | null; note?: string | null } = {}
) {
  if (order.status === "Pending" || order.status === "Voided") return;
  const moves = await db
    .select({ inventoryItemId: stockMovements.inventoryItemId, change: stockMovements.change, reason: stockMovements.reason })
    .from(stockMovements)
    .where(and(eq(stockMovements.restaurantId, restaurantId), eq(stockMovements.referenceId, order.id)));
  if (moves.some((m) => m.reason === "void")) return;
  let giveBack: Map<string, number>;
  if (moves.length > 0) {
    giveBack = new Map();
    for (const m of moves) giveBack.set(m.inventoryItemId, (giveBack.get(m.inventoryItemId) ?? 0) - m.change);
  } else {
    giveBack = await stockUsageForItems(restaurantId, order.items);
  }
  await applyStockChanges(restaurantId, giveBack, { reason: "void", referenceId: order.id, byName: opts.byName, note: opts.note });
}

// An order's lines changed after it was placed (Till edit, Sales Records edit): take or give
// back only the difference.
export async function adjustStockForEdit(
  restaurantId: string,
  orderId: string,
  oldItems: OrderItem[],
  newItems: OrderItem[],
  byName?: string | null
) {
  const [before, after] = await Promise.all([stockUsageForItems(restaurantId, oldItems), stockUsageForItems(restaurantId, newItems)]);
  const diff = new Map<string, number>();
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const change = (before.get(id) ?? 0) - (after.get(id) ?? 0);
    if (Math.abs(change) > 1e-9) diff.set(id, change);
  }
  await applyStockChanges(restaurantId, diff, { reason: "edit", referenceId: orderId, byName });
}

// Lines whose stock would drop below zero if `items` were sold now — for the "warn" and
// "block" negative-stock settings. Only items that are actually going down are checked.
export async function stockShortfalls(restaurantId: string, usage: Map<string, number>) {
  const ids = [...usage.keys()].filter((id) => (usage.get(id) ?? 0) > 0);
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: inventoryItems.id, name: inventoryItems.name, unit: inventoryItems.unit, quantity: inventoryItems.quantity })
    .from(inventoryItems)
    .where(and(eq(inventoryItems.restaurantId, restaurantId), inArray(inventoryItems.id, ids)));
  return rows
    .map((r) => ({ ...r, needed: usage.get(r.id) ?? 0 }))
    .filter((r) => r.quantity - r.needed < -1e-9);
}

export async function negativeStockMode(restaurantId: string): Promise<NegativeStockMode> {
  const [row] = await db.select({ mode: restaurants.negativeStock }).from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1);
  return row?.mode ?? "allow";
}
