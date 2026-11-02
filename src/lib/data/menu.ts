import { and, asc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { categories, dishes, inventoryItems, productBarcodes, productVariants } from "@/db/schema";

export async function listCategories(restaurantId: string) {
  return db.select().from(categories).where(eq(categories.restaurantId, restaurantId));
}

export async function listDishes(restaurantId: string) {
  return db.select().from(dishes).where(eq(dishes.restaurantId, restaurantId));
}

// dishId → its barcodes, for Manage Dishes / Products and (later) the Till's scanner.
export async function listBarcodesByDish(restaurantId: string) {
  const rows = await db
    .select({ dishId: productBarcodes.dishId, code: productBarcodes.code, packQty: productBarcodes.packQty, variantId: productBarcodes.variantId })
    .from(productBarcodes)
    .where(eq(productBarcodes.restaurantId, restaurantId));
  const out: Record<string, { code: string; packQty: number; variantId?: string }[]> = {};
  for (const r of rows) (out[r.dishId] ??= []).push({ code: r.code, packQty: r.packQty, ...(r.variantId ? { variantId: r.variantId } : {}) });
  return out;
}

// What customers can order themselves (online, table QR, kiosk): everything except products sold
// by weight / volume / length, which need weighing at the counter (docs/retail-plan step 3.4).
// Products with serial numbers can never be ordered by customers; ones with variants only where
// the page has a picker (the online shop — `withVariants`), not on the kiosk or table QR menus.
export async function listOrderableDishes(restaurantId: string, opts: { withVariants?: boolean } = {}) {
  return (await listDishes(restaurantId)).filter((d) => d.sellBy === "unit" && !d.trackSerials && (opts.withVariants || !d.variantOptions?.length));
}

// Variants (docs/retail-plan step 5.1) with their barcode and own stock, grouped by product —
// for the product form (all) and the Till (active ones only, via VariantLite).
export interface VariantDetail {
  id: string;
  dishId: string;
  options: Record<string, string>;
  name: string;
  sku: string | null;
  price: number | null;
  costPrice: number | null;
  active: boolean;
  barcode: string | null;
  qty: number | null;
  low: number;
}

export async function listVariantsByDish(restaurantId: string): Promise<Record<string, VariantDetail[]>> {
  const [vars, items, codes] = await Promise.all([
    db.select().from(productVariants).where(eq(productVariants.restaurantId, restaurantId)).orderBy(asc(productVariants.sort)),
    db.select({ id: inventoryItems.id, quantity: inventoryItems.quantity, low: inventoryItems.lowStockThreshold }).from(inventoryItems).where(and(eq(inventoryItems.restaurantId, restaurantId), isNotNull(inventoryItems.variantId))),
    db.select({ variantId: productBarcodes.variantId, code: productBarcodes.code }).from(productBarcodes).where(and(eq(productBarcodes.restaurantId, restaurantId), isNotNull(productBarcodes.variantId))),
  ]);
  const item = new Map(items.map((i) => [i.id, i]));
  const code = new Map(codes.map((c) => [c.variantId!, c.code]));
  const out: Record<string, VariantDetail[]> = {};
  for (const v of vars) {
    const it = v.inventoryItemId ? item.get(v.inventoryItemId) : undefined;
    (out[v.dishId] ??= []).push({
      id: v.id,
      dishId: v.dishId,
      options: v.options,
      name: v.name,
      sku: v.sku,
      price: v.price,
      costPrice: v.costPrice,
      active: v.active,
      barcode: code.get(v.id) ?? null,
      qty: it ? it.quantity : null,
      low: it?.low ?? 0,
    });
  }
  return out;
}
