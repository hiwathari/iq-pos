"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { dishes, inventoryItems, orders, purchaseOrderLines, purchaseOrders, serialNumbers, stockBatches, stockCounts, stockLevels, stockLocations, suppliers } from "@/db/schema";
import { assertPermission, requireRestaurantContext } from "@/lib/scope";
import { findInventoryItem, listLowStockItems } from "@/lib/data/inventory";
import { listMovements, type MovementRow } from "@/lib/data/stock";
import { applyStockChanges } from "@/lib/stock";
import { ADJUST_REASONS } from "@/lib/stock-reasons";

// Stock actions (docs/retail-plan Phase 4): stock items, manual adjustments with a reason,
// goods in (deliveries), and the history shown beside each item. Quantities only ever change
// through applyStockChanges so everything lands in the movement log.

export interface InventoryItemInput {
  name: string;
  unit: string;
  quantity: number;
  lowStockThreshold: number;
  costPrice?: number | null;
  reorderLevel?: number | null;
  reorderQty?: number | null;
  supplierId?: string | null;
}

export interface InventoryFormState {
  error?: string;
}

const optNum = (v: unknown, max = 1e9) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
};

async function ownSupplier(restaurantId: string, supplierId: string | null | undefined) {
  if (!supplierId) return null;
  const [row] = await db.select({ id: suppliers.id }).from(suppliers).where(and(eq(suppliers.id, supplierId), eq(suppliers.restaurantId, restaurantId))).limit(1);
  return row?.id ?? null;
}

function revalidateStock() {
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  revalidatePath("/order-line");
}

export async function createInventoryItemAction(input: InventoryItemInput): Promise<InventoryFormState> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "inventory");

  const name = input.name.trim();
  if (!name) return { error: "Enter an item name." };
  if (!Number.isFinite(input.quantity) || input.quantity < 0) return { error: "Enter a valid starting quantity." };

  // Created at 0 and filled through applyStockChanges, so the opening stock is in its history.
  const [created] = await db
    .insert(inventoryItems)
    .values({
      restaurantId,
      name,
      unit: input.unit.trim() || "pcs",
      quantity: 0,
      lowStockThreshold: Math.max(0, input.lowStockThreshold || 0),
      costPrice: optNum(input.costPrice),
      reorderLevel: optNum(input.reorderLevel),
      reorderQty: optNum(input.reorderQty),
      supplierId: await ownSupplier(restaurantId, input.supplierId),
    })
    .returning({ id: inventoryItems.id });
  await applyStockChanges(restaurantId, new Map([[created.id, input.quantity]]), { reason: "opening", byName: session.name });
  revalidateStock();
  return {};
}

export async function updateInventoryItemAction(itemId: string, input: InventoryItemInput): Promise<InventoryFormState> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "inventory");

  const name = input.name.trim();
  if (!name) return { error: "Enter an item name." };
  const item = await findInventoryItem(restaurantId, itemId);
  if (!item) return { error: "Item not found." };

  const supplierId = await ownSupplier(restaurantId, input.supplierId);
  const costPrice = optNum(input.costPrice);
  await db
    .update(inventoryItems)
    .set({
      // A product's own stock item keeps the product's name (Products screen is where it's renamed).
      name: item.dishId ? item.name : name,
      unit: item.dishId ? item.unit : input.unit.trim() || "pcs",
      lowStockThreshold: Math.max(0, input.lowStockThreshold || 0),
      costPrice,
      reorderLevel: optNum(input.reorderLevel),
      reorderQty: optNum(input.reorderQty),
      supplierId,
    })
    .where(and(eq(inventoryItems.id, itemId), eq(inventoryItems.restaurantId, restaurantId)));
  if (item.dishId) {
    await db.update(dishes).set({ costPrice, supplierId }).where(and(eq(dishes.id, item.dishId), eq(dishes.restaurantId, restaurantId)));
    revalidatePath("/manage-dishes");
  }
  revalidateStock();
  return {};
}

// A manual stock change with a reason (Damaged, Out of date, Theft / loss, Own use → "waste";
// Correction, Other → "adjust"); positive to add, negative to remove. Can't take more than is
// there (sales can, depending on the negative-stock setting; a person correcting stock by hand
// can't), but adding to a negative quantity is fine.
export async function adjustInventoryStockAction(itemId: string, delta: number, reason?: string, note?: string): Promise<InventoryFormState> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "inventory");
  if (!Number.isFinite(delta) || delta === 0) return { error: "Enter a non-zero amount." };

  const item = await findInventoryItem(restaurantId, itemId);
  if (!item) return { error: "Item not found." };
  if (delta < 0 && item.quantity + delta < -1e-9) return { error: `Only ${Math.max(0, item.quantity)} ${item.unit} in stock.` };

  const chosen = ADJUST_REASONS.find((r) => r.label === reason);
  const text = [chosen?.label, note?.trim().slice(0, 200)].filter(Boolean).join(" — ") || null;
  const kind = delta > 0 ? (chosen ? "adjust" : "received") : chosen?.kind ?? "adjust";
  await applyStockChanges(restaurantId, new Map([[itemId, delta]]), {
    reason: kind,
    byName: session.name,
    note: text,
    unitCosts: item.costPrice != null ? new Map([[itemId, item.costPrice]]) : undefined,
  });
  revalidateStock();
  return {};
}

export async function deleteInventoryItemAction(itemId: string) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "inventory");
  await db.delete(inventoryItems).where(and(eq(inventoryItems.id, itemId), eq(inventoryItems.restaurantId, restaurantId)));
  revalidateStock();
  revalidatePath("/manage-dishes");
}

// ---- Goods in (step 4.2) ----

export interface GoodsInLine {
  itemId: string;
  qty: number;
  cost?: number | null;
  // Products that track serial / IMEI numbers (step 5.2): one per unit received.
  serials?: string[];
  // Put-away bin (step 6.1) and lot / best-before (step 6.2), when those features are on.
  locationId?: string | null;
  lot?: string;
  expiresOn?: string;
}

export interface GoodsInInput {
  supplierId?: string | null;
  reference?: string;
  purchaseOrderId?: string | null;
  lines: GoodsInLine[];
}

// Book a delivery in: each line adds to stock ("received"), the latest cost price is kept on the
// item (and its product), and — when it's against a purchase order — the order's lines are ticked
// off and its status moved on (part received → received).
export async function receiveStockAction(input: GoodsInInput): Promise<InventoryFormState & { booked?: number }> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "inventory");

  const lines = (Array.isArray(input?.lines) ? input.lines : []).filter((l) => l && Number(l.qty) > 0);
  if (lines.length === 0) return { error: "Add at least one item with a quantity." };
  const items = await db
    .select()
    .from(inventoryItems)
    .where(and(eq(inventoryItems.restaurantId, restaurantId), inArray(inventoryItems.id, [...new Set(lines.map((l) => l.itemId))])));
  const byId = new Map(items.map((i) => [i.id, i]));
  if (lines.some((l) => !byId.has(l.itemId))) return { error: "One of those items no longer exists." };

  // Serial-tracked products need exactly one serial per unit, none already on record.
  const dishIdsOfItems = [...new Set(items.map((i) => i.dishId).filter((d): d is string => !!d))];
  const trackedDishes = new Set(
    dishIdsOfItems.length
      ? (await db.select({ id: dishes.id }).from(dishes).where(and(eq(dishes.restaurantId, restaurantId), inArray(dishes.id, dishIdsOfItems), eq(dishes.trackSerials, true)))).map((d) => d.id)
      : []
  );
  const newSerials: { dishId: string; variantId: string | null; serial: string }[] = [];
  for (const l of lines) {
    const item = byId.get(l.itemId)!;
    if (!item.dishId || !trackedDishes.has(item.dishId)) continue;
    const serials = [...new Set((l.serials ?? []).map((s) => String(s).trim()).filter(Boolean))];
    if (serials.length !== Math.round(Number(l.qty))) return { error: `${item.name}: enter one serial number for each of the ${Math.round(Number(l.qty))} received (${serials.length} given).` };
    for (const serial of serials) newSerials.push({ dishId: item.dishId, variantId: item.variantId, serial });
  }
  if (newSerials.length) {
    if (new Set(newSerials.map((s) => s.serial)).size !== newSerials.length) return { error: "The same serial number is on this delivery twice." };
    const clash = await db
      .select({ serial: serialNumbers.serial })
      .from(serialNumbers)
      .where(and(eq(serialNumbers.restaurantId, restaurantId), inArray(serialNumbers.serial, newSerials.map((s) => s.serial))))
      .limit(1);
    if (clash[0]) return { error: `Serial ${clash[0].serial} is already on record.` };
  }

  let po: typeof purchaseOrders.$inferSelect | null = null;
  if (input.purchaseOrderId) {
    [po = null] = await db
      .select()
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, input.purchaseOrderId), eq(purchaseOrders.restaurantId, restaurantId)))
      .limit(1);
    if (!po) return { error: "That purchase order no longer exists." };
    if (po.status === "cancelled" || po.status === "received") return { error: `${po.number} is already ${po.status}.` };
  }

  const reference = (input.reference ?? "").trim().slice(0, 60);
  // The history links to the order itself, so its number isn't repeated in the note.
  const note = reference ? `delivery ${reference}` : po ? null : "Delivery";

  // Same item on several lines (e.g. two scans of one case barcode) books as one movement.
  const qtyByItem = new Map<string, number>();
  const costByItem = new Map<string, number>();
  for (const l of lines) {
    qtyByItem.set(l.itemId, (qtyByItem.get(l.itemId) ?? 0) + Number(l.qty));
    const cost = optNum(l.cost);
    if (cost != null) costByItem.set(l.itemId, cost);
  }
  await applyStockChanges(restaurantId, qtyByItem, {
    reason: "received",
    referenceId: po?.id ?? null,
    byName: session.name,
    note,
    unitCosts: costByItem,
  });
  // Put-away and batches: where it went and which lot / expiry (steps 6.1–6.2).
  const placed = lines.filter((l) => l.locationId || (l.lot && l.lot.trim()) || (l.expiresOn && /^\d{4}-\d{2}-\d{2}$/.test(l.expiresOn)));
  if (placed.length) {
    const locIds = [...new Set(placed.map((l) => l.locationId).filter((x): x is string => !!x))];
    const okLocs = new Set(locIds.length ? (await db.select({ id: stockLocations.id }).from(stockLocations).where(and(eq(stockLocations.restaurantId, restaurantId), inArray(stockLocations.id, locIds)))).map((r) => r.id) : []);
    const now = Date.now();
    for (const l of placed) {
      const qty = Number(l.qty);
      if (l.locationId && okLocs.has(l.locationId)) {
        const [lvl] = await db.select().from(stockLevels).where(and(eq(stockLevels.inventoryItemId, l.itemId), eq(stockLevels.locationId, l.locationId))).limit(1);
        if (lvl) await db.update(stockLevels).set({ quantity: Math.round((lvl.quantity + qty) * 1e6) / 1e6 }).where(and(eq(stockLevels.inventoryItemId, l.itemId), eq(stockLevels.locationId, l.locationId)));
        else await db.insert(stockLevels).values({ inventoryItemId: l.itemId, locationId: l.locationId, quantity: qty });
      }
      const lot = (l.lot ?? "").trim().slice(0, 40) || null;
      const expiresOn = l.expiresOn && /^\d{4}-\d{2}-\d{2}$/.test(l.expiresOn) ? l.expiresOn : null;
      if (lot || expiresOn) await db.insert(stockBatches).values({ restaurantId, inventoryItemId: l.itemId, locationId: l.locationId && okLocs.has(l.locationId) ? l.locationId : null, lot, expiresOn, quantity: qty, receivedAt: now });
    }
  }
  if (newSerials.length) {
    const receivedAt = Date.now();
    for (let at = 0; at < newSerials.length; at += 100) {
      await db.insert(serialNumbers).values(newSerials.slice(at, at + 100).map((s) => ({ restaurantId, ...s, status: "in_stock" as const, receivedAt })));
    }
  }
  for (const [itemId, cost] of costByItem) {
    const item = byId.get(itemId)!;
    await db.update(inventoryItems).set({ costPrice: cost }).where(eq(inventoryItems.id, itemId));
    if (item.dishId) await db.update(dishes).set({ costPrice: cost }).where(eq(dishes.id, item.dishId));
  }
  const supplierId = await ownSupplier(restaurantId, input.supplierId ?? po?.supplierId);
  if (supplierId) {
    // First delivery from a supplier makes it the item's supplier if it had none.
    const noSupplier = items.filter((i) => !i.supplierId && !i.dishId).map((i) => i.id);
    if (noSupplier.length) await db.update(inventoryItems).set({ supplierId }).where(inArray(inventoryItems.id, noSupplier));
  }

  if (po) {
    const poLines = await db.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.purchaseOrderId, po.id));
    // Spread what arrived over the order's lines for that item, oldest first; anything beyond
    // what was ordered (a short-dated extra case) is kept on the first line.
    for (const [itemId, qty] of qtyByItem) {
      const mine = poLines.filter((p) => p.inventoryItemId === itemId);
      let left = qty;
      for (const [idx, pl] of mine.entries()) {
        const room = Math.max(0, pl.qtyOrdered - pl.qtyReceived);
        const take = idx === mine.length - 1 ? left : Math.min(left, room);
        if (take <= 0) continue;
        pl.qtyReceived = Math.round((pl.qtyReceived + take) * 1000) / 1000;
        left -= take;
        await db.update(purchaseOrderLines).set({ qtyReceived: pl.qtyReceived }).where(eq(purchaseOrderLines.id, pl.id));
      }
    }
    const done = poLines.every((p) => p.qtyReceived + 1e-9 >= p.qtyOrdered);
    await db
      .update(purchaseOrders)
      .set({ status: done ? "received" : "part_received", receivedAt: done ? Date.now() : null })
      .where(eq(purchaseOrders.id, po.id));
    revalidatePath("/purchase-orders");
  }
  revalidateStock();
  return { booked: qtyByItem.size };
}

// ---- History (step 4.1) ----

export interface MovementView extends MovementRow {
  refLabel: string | null;
  refHref: string | null;
}

export async function stockHistoryAction(itemId: string): Promise<MovementView[]> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "inventory");
  const rows = await listMovements(restaurantId, itemId);
  const refs = [...new Set(rows.map((r) => r.referenceId).filter((r): r is string => !!r))];
  const [orderRows, poRows, countRows] = refs.length
    ? await Promise.all([
        db.select({ id: orders.id, n: orders.orderNumber }).from(orders).where(and(eq(orders.restaurantId, restaurantId), inArray(orders.id, refs))),
        db.select({ id: purchaseOrders.id, n: purchaseOrders.number }).from(purchaseOrders).where(and(eq(purchaseOrders.restaurantId, restaurantId), inArray(purchaseOrders.id, refs))),
        db.select({ id: stockCounts.id, n: stockCounts.name, at: stockCounts.createdAt }).from(stockCounts).where(and(eq(stockCounts.restaurantId, restaurantId), inArray(stockCounts.id, refs))),
      ])
    : [[], [], []];
  const orderBy = new Map(orderRows.map((o) => [o.id, o.n]));
  const poBy = new Map(poRows.map((o) => [o.id, o.n]));
  const countBy = new Map(countRows.map((o) => [o.id, o.n || "Stocktake"]));
  return rows.map((r) => {
    const ref = r.referenceId;
    if (ref && orderBy.has(ref)) return { ...r, refLabel: `Order ${orderBy.get(ref)}`, refHref: `/invoice/${ref}` };
    if (ref && poBy.has(ref)) return { ...r, refLabel: poBy.get(ref)!, refHref: `/purchase-orders/${ref}` };
    if (ref && countBy.has(ref)) return { ...r, refLabel: countBy.get(ref)!, refHref: `/stocktake/${ref}` };
    return { ...r, refLabel: null, refHref: null };
  });
}

// Used by the dashboard alert — kept here so the count has one definition.
export async function lowStockCountAction() {
  const { restaurantId } = await requireRestaurantContext();
  return (await listLowStockItems(restaurantId)).length;
}
