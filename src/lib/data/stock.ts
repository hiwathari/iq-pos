import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { categories, dishes, inventoryItems, productBarcodes, productVariants, purchaseOrderLines, purchaseOrders, stockMovements, suppliers } from "@/db/schema";

// Stock screen data (docs/retail-plan step 4.1): every stock item with the product it belongs to
// (SKU, barcodes, category), its supplier, value at cost and when it last changed.

export interface StockRow {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  lowStockThreshold: number;
  costPrice: number | null;
  reorderLevel: number | null;
  reorderQty: number | null;
  supplierId: string | null;
  supplierName: string | null;
  dishId: string | null;
  trackSerials: boolean;
  sku: string | null;
  categoryId: string | null;
  categoryName: string | null;
  barcodes: string[];
  packBarcodes: { code: string; packQty: number }[];
  value: number;
  lastChange: number | null;
}

export async function listStockRows(restaurantId: string): Promise<StockRow[]> {
  const [items, dishRows, bcRows, supplierRows, lastRows, variantRows] = await Promise.all([
    db.select().from(inventoryItems).where(eq(inventoryItems.restaurantId, restaurantId)).orderBy(asc(inventoryItems.name)),
    db
      .select({ id: dishes.id, sku: dishes.sku, categoryId: dishes.categoryId, categoryName: categories.name, supplierId: dishes.supplierId, trackSerials: dishes.trackSerials })
      .from(dishes)
      .leftJoin(categories, eq(categories.id, dishes.categoryId))
      .where(eq(dishes.restaurantId, restaurantId)),
    db
      .select({ dishId: productBarcodes.dishId, variantId: productBarcodes.variantId, code: productBarcodes.code, packQty: productBarcodes.packQty })
      .from(productBarcodes)
      .where(eq(productBarcodes.restaurantId, restaurantId)),
    db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).where(eq(suppliers.restaurantId, restaurantId)),
    db
      .select({ itemId: stockMovements.inventoryItemId, last: sql<number>`max(${stockMovements.createdAt})` })
      .from(stockMovements)
      .where(eq(stockMovements.restaurantId, restaurantId))
      .groupBy(stockMovements.inventoryItemId),
    db.select({ id: productVariants.id, sku: productVariants.sku }).from(productVariants).where(eq(productVariants.restaurantId, restaurantId)),
  ]);
  const variantSku = new Map(variantRows.map((v) => [v.id, v.sku]));
  const dishById = new Map(dishRows.map((d) => [d.id, d]));
  const supplierName = new Map(supplierRows.map((s) => [s.id, s.name]));
  const lastBy = new Map(lastRows.map((r) => [r.itemId, Number(r.last)]));
  // Barcodes by owner: a variant's stock item gets its variant's codes, a plain product its own.
  const codesByDish = new Map<string, { code: string; packQty: number }[]>();
  for (const b of bcRows) {
    const key = b.variantId ?? b.dishId;
    codesByDish.set(key, [...(codesByDish.get(key) ?? []), { code: b.code, packQty: b.packQty }]);
  }

  return items.map((i) => {
    const dish = i.dishId ? dishById.get(i.dishId) : undefined;
    const supplierId = i.supplierId ?? dish?.supplierId ?? null;
    const codes = i.variantId ? (codesByDish.get(i.variantId) ?? []) : i.dishId ? (codesByDish.get(i.dishId) ?? []) : [];
    return {
      id: i.id,
      name: i.name,
      unit: i.unit,
      quantity: i.quantity,
      lowStockThreshold: i.lowStockThreshold,
      costPrice: i.costPrice,
      reorderLevel: i.reorderLevel,
      reorderQty: i.reorderQty,
      supplierId,
      supplierName: supplierId ? (supplierName.get(supplierId) ?? null) : null,
      dishId: i.dishId,
      trackSerials: !!dish?.trackSerials,
      sku: (i.variantId ? variantSku.get(i.variantId) : null) ?? dish?.sku ?? null,
      categoryId: dish?.categoryId ?? null,
      categoryName: dish?.categoryName ?? null,
      barcodes: codes.map((c) => c.code),
      packBarcodes: codes,
      value: Math.max(0, i.quantity) * (i.costPrice ?? 0),
      lastChange: lastBy.get(i.id) ?? null,
    };
  });
}

export interface MovementRow {
  id: string;
  change: number;
  quantityAfter: number;
  reason: string;
  referenceId: string | null;
  note: string | null;
  unitCost: number | null;
  by: string | null;
  at: number;
}

export async function listMovements(restaurantId: string, inventoryItemId: string, limit = 100): Promise<MovementRow[]> {
  const rows = await db
    .select()
    .from(stockMovements)
    .where(and(eq(stockMovements.restaurantId, restaurantId), eq(stockMovements.inventoryItemId, inventoryItemId)))
    .orderBy(desc(stockMovements.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    change: r.change,
    quantityAfter: r.quantityAfter,
    reason: r.reason,
    referenceId: r.referenceId,
    note: r.note,
    unitCost: r.unitCost,
    by: r.createdByName,
    at: r.createdAt,
  }));
}

export async function stockTotals(restaurantId: string) {
  const rows = await listStockRows(restaurantId);
  return {
    value: rows.reduce((s, r) => s + r.value, 0),
    low: rows.filter((r) => r.quantity > 0 && r.quantity <= r.lowStockThreshold).length,
    out: rows.filter((r) => r.quantity === 0).length,
    negative: rows.filter((r) => r.quantity < 0).length,
  };
}

export async function itemsByIds(restaurantId: string, ids: string[]) {
  if (ids.length === 0) return [];
  return db
    .select()
    .from(inventoryItems)
    .where(and(eq(inventoryItems.restaurantId, restaurantId), inArray(inventoryItems.id, ids)));
}

// Reorder suggestions (step 4.7): items at or below their reorder level (default: the low-stock
// level) that aren't already covered by an open purchase order. Suggested quantity is the item's
// "order this many", or enough to bring it back to twice its level.
export interface ReorderRow {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  level: number;
  onOrder: number;
  suggested: number;
  costPrice: number | null;
  supplierId: string | null;
  supplierName: string | null;
}

export async function listReorderSuggestions(restaurantId: string): Promise<ReorderRow[]> {
  const [rows, open] = await Promise.all([
    listStockRows(restaurantId),
    db
      .select({ itemId: purchaseOrderLines.inventoryItemId, ordered: purchaseOrderLines.qtyOrdered, received: purchaseOrderLines.qtyReceived })
      .from(purchaseOrderLines)
      .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderLines.purchaseOrderId))
      .where(and(eq(purchaseOrders.restaurantId, restaurantId), inArray(purchaseOrders.status, ["draft", "sent", "part_received"]))),
  ]);
  const onOrder = new Map<string, number>();
  for (const l of open) onOrder.set(l.itemId, (onOrder.get(l.itemId) ?? 0) + Math.max(0, l.ordered - l.received));
  const out: ReorderRow[] = [];
  for (const r of rows) {
    const level = r.reorderLevel ?? r.lowStockThreshold;
    if (level <= 0 && r.quantity > 0) continue;
    if (r.quantity > level) continue;
    const coming = onOrder.get(r.id) ?? 0;
    if (r.quantity + coming > level) continue;
    const want = r.reorderQty ?? Math.max(level * 2 - r.quantity, 1);
    const suggested = Math.max(0, Math.ceil((want - coming) * 1000) / 1000);
    if (suggested <= 0) continue;
    out.push({ id: r.id, name: r.name, unit: r.unit, quantity: r.quantity, level, onOrder: coming, suggested, costPrice: r.costPrice, supplierId: r.supplierId, supplierName: r.supplierName });
  }
  return out;
}
