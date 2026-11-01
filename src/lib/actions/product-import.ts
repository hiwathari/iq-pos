"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { BatchItem } from "drizzle-orm/batch";
import { db } from "@/db/client";
import { categories, dishes, inventoryItems, productBarcodes, stockMovements } from "@/db/schema";
import { assertPermission, requireRestaurantContext } from "@/lib/scope";
import { checkBarcode, type Symbology } from "@/lib/barcode";
import { isSellBy, isUnitFor, stockUnitFor, type SellBy } from "@/lib/units";
import { IMPORT_COLUMNS, type ImportRow } from "@/lib/product-columns";

// Products from a spreadsheet (docs/retail-plan step 2.5). The page sends rows in chunks of up
// to 200; each chunk loads what it needs once and writes in a single db.batch round trip, so
// thousands of rows import quickly over Turso. Rows are matched to existing products by SKU,
// then barcode, then exact name; anything else is added.


export interface ImportOptions {
  createCategories: boolean;
  // Off: stock columns are ignored for products that already exist (new ones still get it).
  updateStock: boolean;
}

export interface ImportRowResult {
  row: number;
  status: "added" | "updated" | "skipped";
  name: string;
  message?: string;
}

const yes = (v?: string) => /^(1|y|yes|true|on)$/i.test((v ?? "").trim());
const num = (v?: string) => {
  const s = (v ?? "").replace(/[£$€,\s%]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

export async function importProductsAction(rows: ImportRow[], firstRowNumber: number, options: ImportOptions): Promise<{ results: ImportRowResult[]; error?: string }> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "manage-dishes");
  if (!Array.isArray(rows) || rows.length > 200) return { results: [], error: "Send at most 200 rows at a time." };

  const [cats, existing, codes, items] = await Promise.all([
    db.select().from(categories).where(eq(categories.restaurantId, restaurantId)),
    db.select().from(dishes).where(eq(dishes.restaurantId, restaurantId)),
    db.select().from(productBarcodes).where(eq(productBarcodes.restaurantId, restaurantId)),
    db.select().from(inventoryItems).where(eq(inventoryItems.restaurantId, restaurantId)),
  ]);
  const catByName = new Map(cats.map((c) => [c.name.trim().toLowerCase(), c.id]));
  const dishBySku = new Map(existing.filter((d) => d.sku).map((d) => [d.sku!.toLowerCase(), d]));
  const dishById = new Map(existing.map((d) => [d.id, d]));
  const dishByName = new Map(existing.map((d) => [d.name.trim().toLowerCase(), d]));
  const codeOwner = new Map(codes.map((c) => [c.code, c.dishId]));
  const itemNames = new Set(items.map((i) => i.name));
  const ownItem = new Map(items.filter((i) => i.dishId).map((i) => [i.dishId!, i]));
  const skuOwner = new Map(existing.filter((d) => d.sku).map((d) => [d.sku!.toLowerCase(), d.id]));

  const writes: BatchItem<"sqlite">[] = [];
  const results: ImportRowResult[] = [];
  const now = Date.now();

  for (const [i, raw] of rows.entries()) {
    const rowNo = firstRowNumber + i;
    const name = (raw.name ?? "").trim().slice(0, 120);
    const skip = (message: string) => results.push({ row: rowNo, status: "skipped", name: name || "(no name)", message });

    // Barcodes in the row
    const rowCodes: { code: string; symbology: Symbology }[] = [];
    let bad: string | null = null;
    for (const v of [raw.barcode, raw.barcode2]) {
      if (!v?.trim()) continue;
      const c = checkBarcode(v);
      if (!c.ok) {
        bad = `Barcode ${c.code}: ${c.message}`;
        break;
      }
      if (!rowCodes.some((x) => x.code === c.code)) rowCodes.push({ code: c.code, symbology: c.symbology });
    }
    if (bad) {
      skip(bad);
      continue;
    }

    const sku = (raw.sku ?? "").trim().slice(0, 64) || null;
    const match =
      (sku && dishBySku.get(sku.toLowerCase())) ||
      rowCodes.map((c) => codeOwner.get(c.code)).map((id) => (id ? dishById.get(id) : undefined)).find(Boolean) ||
      (name ? dishByName.get(name.toLowerCase()) : undefined);

    if (!match && !name) {
      skip("Needs a name.");
      continue;
    }
    const clash = rowCodes.find((c) => codeOwner.has(c.code) && codeOwner.get(c.code) !== match?.id);
    if (clash) {
      skip(`Barcode ${clash.code} already belongs to ${dishById.get(codeOwner.get(clash.code)!)?.name ?? "another product"}.`);
      continue;
    }
    if (sku && skuOwner.has(sku.toLowerCase()) && skuOwner.get(sku.toLowerCase()) !== match?.id) {
      skip(`SKU ${sku} already belongs to another product.`);
      continue;
    }

    // Category
    let categoryId = match?.categoryId;
    const catName = (raw.category ?? "").trim();
    if (catName) {
      categoryId = catByName.get(catName.toLowerCase());
      if (!categoryId) {
        if (!options.createCategories) {
          skip(`No category called "${catName}".`);
          continue;
        }
        categoryId = crypto.randomUUID();
        catByName.set(catName.toLowerCase(), categoryId);
        writes.push(db.insert(categories).values({ id: categoryId, restaurantId, name: catName.slice(0, 60), icon: "all" }));
      }
    }
    if (!categoryId) {
      skip("Needs a category.");
      continue;
    }

    // Numbers and choices
    const price = num(raw.price);
    if (price === null && !match) {
      skip("Needs a price.");
      continue;
    }
    if (Number.isNaN(price) || (price !== null && price < 0)) {
      skip(`Price "${raw.price}" isn't a number.`);
      continue;
    }
    const sellByRaw = (raw.sell_by ?? "").trim().toLowerCase();
    if (sellByRaw && !isSellBy(sellByRaw)) {
      skip(`sell_by "${raw.sell_by}" should be unit, weight, volume or length.`);
      continue;
    }
    const sellBy: SellBy = isSellBy(sellByRaw) ? sellByRaw : ((match?.sellBy as SellBy) ?? "unit");
    const unitRaw = (raw.unit ?? "").trim().toLowerCase();
    const unit = unitRaw ? unitRaw : match && match.sellBy === sellBy ? match.unit : sellBy === "unit" ? "each" : sellBy === "weight" ? "kg" : sellBy === "volume" ? "l" : "m";
    if (!isUnitFor(sellBy, unit)) {
      skip(`unit "${unit}" doesn't go with ${sellBy}.`);
      continue;
    }
    const cost = num(raw.cost_price);
    const vat = num(raw.vat);
    const minAge = num(raw.min_age);
    const stock = num(raw.stock);
    const low = num(raw.low_stock);
    if ([cost, vat, minAge, stock, low].some((n) => Number.isNaN(n))) {
      skip("A number column has text in it.");
      continue;
    }
    const trackStock = raw.track_stock !== undefined && raw.track_stock !== "" ? yes(raw.track_stock) : match ? match.trackStock : stock !== null;

    const values = {
      name: name || match!.name,
      categoryId,
      price: price ?? match!.price,
      sellBy,
      unit,
      sku: sku ?? match?.sku ?? null,
      brand: (raw.brand ?? "").trim().slice(0, 80) || match?.brand || null,
      costPrice: cost ?? match?.costPrice ?? null,
      taxRateOverride: vat ?? match?.taxRateOverride ?? null,
      minAge: minAge && [16, 18, 21, 25].includes(minAge) ? minAge : (match?.minAge ?? null),
      description: (raw.description ?? "").trim() || match?.description || null,
      imageUrl: (raw.image_url ?? "").trim() || match?.imageUrl || null,
      trackStock,
    };

    const dishId = match?.id ?? crypto.randomUUID();
    if (match) writes.push(db.update(dishes).set(values).where(eq(dishes.id, dishId)));
    else writes.push(db.insert(dishes).values({ id: dishId, restaurantId, emoji: "📦", color: "#DCEEE8", ...values }));
    for (const c of rowCodes) {
      if (codeOwner.get(c.code) === dishId) continue;
      writes.push(db.insert(productBarcodes).values({ restaurantId, dishId, code: c.code, symbology: c.symbology, packQty: 1 }));
      codeOwner.set(c.code, dishId);
    }

    // Own stock item
    if (trackStock) {
      const own = ownItem.get(dishId);
      const stockUnit = stockUnitFor(sellBy, unit);
      if (own) {
        writes.push(
          db
            .update(inventoryItems)
            .set({ unit: stockUnit, costPrice: values.costPrice, ...(low !== null ? { lowStockThreshold: low } : {}) })
            .where(eq(inventoryItems.id, own.id))
        );
        if (stock !== null && options.updateStock && Math.abs(stock - own.quantity) > 1e-9) {
          writes.push(db.update(inventoryItems).set({ quantity: stock }).where(eq(inventoryItems.id, own.id)));
          writes.push(
            db.insert(stockMovements).values({ restaurantId, inventoryItemId: own.id, change: stock - own.quantity, quantityAfter: stock, reason: "count", note: "Spreadsheet import", createdByName: session.name, createdAt: now })
          );
        }
        if (!match?.inventoryItemId || match.inventoryItemId !== own.id) writes.push(db.update(dishes).set({ inventoryItemId: own.id, inventoryUsagePerOrder: 1 }).where(eq(dishes.id, dishId)));
      } else {
        const itemId = crypto.randomUUID();
        let itemName = values.name;
        for (let n = 2; itemNames.has(itemName); n++) itemName = `${values.name} (${n})`;
        itemNames.add(itemName);
        const qty = stock ?? 0;
        writes.push(
          db.insert(inventoryItems).values({ id: itemId, restaurantId, name: itemName, unit: stockUnit, quantity: qty, lowStockThreshold: low ?? 0, dishId, costPrice: values.costPrice })
        );
        if (qty) writes.push(db.insert(stockMovements).values({ restaurantId, inventoryItemId: itemId, change: qty, quantityAfter: qty, reason: "opening", note: "Spreadsheet import", createdByName: session.name, createdAt: now }));
        writes.push(db.update(dishes).set({ inventoryItemId: itemId, inventoryUsagePerOrder: 1 }).where(eq(dishes.id, dishId)));
        ownItem.set(dishId, { id: itemId } as (typeof items)[number]);
      }
    }

    if (!match) {
      const added = { ...values, id: dishId } as (typeof existing)[number];
      dishById.set(dishId, added);
      dishByName.set(values.name.toLowerCase(), added);
      if (values.sku) {
        dishBySku.set(values.sku.toLowerCase(), added);
        skuOwner.set(values.sku.toLowerCase(), dishId);
      }
    }
    results.push({ row: rowNo, status: match ? "updated" : "added", name: values.name });
  }

  if (writes.length) await db.batch(writes as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  revalidatePath("/manage-dishes");
  revalidatePath("/order-line");
  revalidatePath("/inventory");
  return { results };
}

// Used by the export button: everything the import understands, one row per product.
export async function exportProductsAction(): Promise<{ header: string[]; rows: string[][] }> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "manage-dishes");
  const [cats, list, codes, items] = await Promise.all([
    db.select().from(categories).where(eq(categories.restaurantId, restaurantId)),
    db.select().from(dishes).where(eq(dishes.restaurantId, restaurantId)),
    db.select().from(productBarcodes).where(eq(productBarcodes.restaurantId, restaurantId)),
    db.select().from(inventoryItems).where(and(eq(inventoryItems.restaurantId, restaurantId))),
  ]);
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const own = new Map(items.filter((i) => i.dishId).map((i) => [i.dishId!, i]));
  const rows = list
    .sort((a, b) => (catName.get(a.categoryId) ?? "").localeCompare(catName.get(b.categoryId) ?? "") || a.name.localeCompare(b.name))
    .map((d) => {
      const bc = codes.filter((c) => c.dishId === d.id).map((c) => c.code);
      const item = own.get(d.id);
      return [
        d.sku ?? "",
        bc[0] ?? "",
        bc[1] ?? "",
        d.name,
        catName.get(d.categoryId) ?? "",
        d.sellBy,
        d.unit,
        d.price.toFixed(2),
        d.costPrice != null ? d.costPrice.toFixed(2) : "",
        d.taxRateOverride != null ? String(d.taxRateOverride) : "",
        d.minAge ? String(d.minAge) : "",
        d.trackStock ? "yes" : "no",
        item ? String(Math.round(item.quantity * 1000) / 1000) : "",
        item ? String(item.lowStockThreshold) : "",
        d.brand ?? "",
        d.description ?? "",
        d.imageUrl ?? "",
      ];
    });
  return { header: [...IMPORT_COLUMNS], rows };
}
