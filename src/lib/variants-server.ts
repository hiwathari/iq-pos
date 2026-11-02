import "server-only";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { dishes, inventoryItems, productBarcodes, productVariants } from "@/db/schema";
import { checkBarcode } from "@/lib/barcode";
import { applyStockChanges } from "@/lib/stock";
import { cleanOptions, combinations, comboKey, MAX_VARIANTS, variantLabel, type VariantOption } from "@/lib/variants";

// Saves a product's variants (docs/retail-plan step 5.1): one row per size/colour combination,
// each with its own SKU, barcode, price, cost and — when stock is tracked — its own stock item,
// so a sale of M / Blue only takes M / Blue off the shelf. Combinations taken off the grid are
// switched off, never deleted, so old orders and history keep making sense.

export interface VariantInput {
  options: Record<string, string>;
  sku?: string;
  barcode?: string;
  price?: number | null;
  costPrice?: number | null;
  // Tracked stock: how many are in stock now (blank = this variant's stock isn't tracked).
  stockQty?: number | null;
  lowStock?: number | null;
  active?: boolean;
}

const num = (v: unknown, min: number, max: number) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

async function freeName(restaurantId: string, name: string, selfId: string | null) {
  for (let n = 1; n < 50; n++) {
    const candidate = n === 1 ? name : `${name} (${n})`;
    const [hit] = await db.select({ id: inventoryItems.id }).from(inventoryItems).where(and(eq(inventoryItems.restaurantId, restaurantId), eq(inventoryItems.name, candidate))).limit(1);
    if (!hit || hit.id === selfId) return candidate;
  }
  return `${name} (${crypto.randomUUID().slice(0, 4)})`;
}

export async function saveVariantsForDish(
  restaurantId: string,
  dish: { id: string; name: string; supplierId: string | null },
  rawOptions: unknown,
  rawVariants: unknown,
  byName: string
): Promise<{ error?: string }> {
  const options: VariantOption[] = cleanOptions(rawOptions);
  const wantedCombos = combinations(options);
  const inputs = (Array.isArray(rawVariants) ? (rawVariants as VariantInput[]) : []).filter((v) => v && v.options);
  if (wantedCombos.length > MAX_VARIANTS) return { error: `That's ${wantedCombos.length} combinations — the most one product can have is ${MAX_VARIANTS}.` };

  const existing = await db.select().from(productVariants).where(eq(productVariants.dishId, dish.id));
  const existingByKey = new Map(existing.map((v) => [comboKey(v.options, options), v]));

  // Validate SKUs and barcodes before writing anything.
  const byKey = new Map<string, VariantInput>();
  for (const v of inputs) byKey.set(comboKey(v.options, options), v);
  const skus = new Set<string>();
  const codes = new Map<string, string>();
  for (const combo of wantedCombos) {
    const key = comboKey(combo, options);
    const v = byKey.get(key);
    if (!v) continue;
    const label = variantLabel(combo, options);
    const sku = String(v.sku ?? "").trim().slice(0, 64);
    if (sku) {
      if (skus.has(sku)) return { error: `SKU ${sku} is used twice in this product's variants.` };
      skus.add(sku);
    }
    const barcode = String(v.barcode ?? "").trim();
    if (barcode) {
      const check = checkBarcode(barcode);
      if (!check.ok) return { error: `${label}: barcode ${check.code} — ${check.message}` };
      if ([...codes.keys()].includes(check.code)) return { error: `Barcode ${check.code} is used twice in this product's variants.` };
      codes.set(check.code, key);
    }
  }
  if (skus.size) {
    const own = existing.map((e) => e.id);
    const clash = await db.select({ sku: dishes.sku, name: dishes.name }).from(dishes).where(and(eq(dishes.restaurantId, restaurantId), inArray(dishes.sku, [...skus]), ne(dishes.id, dish.id)));
    if (clash[0]) return { error: `SKU ${clash[0].sku} is already used by ${clash[0].name}.` };
    const vclash = await db.select({ sku: productVariants.sku, name: productVariants.name }).from(productVariants).where(and(eq(productVariants.restaurantId, restaurantId), inArray(productVariants.sku, [...skus])));
    const other = vclash.find((c) => !own.length || !existing.some((e) => e.sku === c.sku));
    if (other) return { error: `SKU ${other.sku} is already used by a variant (${other.name}).` };
  }
  if (codes.size) {
    const taken = await db
      .select({ code: productBarcodes.code, variantId: productBarcodes.variantId, dishId: productBarcodes.dishId })
      .from(productBarcodes)
      .where(and(eq(productBarcodes.restaurantId, restaurantId), inArray(productBarcodes.code, [...codes.keys()])));
    const ownVariantIds = new Set(existing.map((e) => e.id));
    const clash = taken.find((t) => !(t.dishId === dish.id && t.variantId && ownVariantIds.has(t.variantId)));
    if (clash) return { error: `Barcode ${clash.code} is already used by another product.` };
  }

  const kept = new Set<string>();
  let sort = 0;
  for (const combo of wantedCombos) {
    const key = comboKey(combo, options);
    const v = byKey.get(key);
    if (!v) continue;
    const label = variantLabel(combo, options);
    const row = existingByKey.get(key);
    const values = {
      options: combo,
      name: label,
      sku: String(v.sku ?? "").trim().slice(0, 64) || null,
      price: num(v.price, 0, 1e6),
      costPrice: num(v.costPrice, 0, 1e6),
      active: v.active !== false,
      sort: sort++,
    };
    let id = row?.id;
    if (row) await db.update(productVariants).set(values).where(eq(productVariants.id, row.id));
    else {
      const [created] = await db.insert(productVariants).values({ restaurantId, dishId: dish.id, ...values }).returning({ id: productVariants.id });
      id = created.id;
    }
    kept.add(id!);

    // Own stock item per variant, when its stock is tracked.
    const wanted = num(v.stockQty, -1e7, 1e7);
    let itemId = row?.inventoryItemId ?? null;
    if (wanted !== null || itemId) {
      const itemName = await freeName(restaurantId, `${dish.name} — ${label}`, itemId);
      const low = num(v.lowStock, 0, 1e7) ?? 0;
      let current = 0;
      if (itemId) {
        const [it] = await db.select({ quantity: inventoryItems.quantity }).from(inventoryItems).where(eq(inventoryItems.id, itemId)).limit(1);
        current = it?.quantity ?? 0;
        await db.update(inventoryItems).set({ name: itemName, lowStockThreshold: low, costPrice: values.costPrice, supplierId: dish.supplierId }).where(eq(inventoryItems.id, itemId));
      } else {
        const [it] = await db
          .insert(inventoryItems)
          .values({ restaurantId, name: itemName, unit: "pcs", quantity: 0, lowStockThreshold: low, dishId: dish.id, variantId: id!, costPrice: values.costPrice, supplierId: dish.supplierId })
          .returning({ id: inventoryItems.id });
        itemId = it.id;
        await db.update(productVariants).set({ inventoryItemId: itemId }).where(eq(productVariants.id, id!));
      }
      if (wanted !== null && Math.abs(wanted - current) > 1e-9) {
        await applyStockChanges(restaurantId, new Map([[itemId, wanted - current]]), { reason: current === 0 && !row?.inventoryItemId ? "opening" : "count", byName, note: row?.inventoryItemId ? "Set in the product form" : null });
      }
    }
  }
  // Combinations no longer on the grid are switched off.
  const gone = existing.filter((e) => !kept.has(e.id)).map((e) => e.id);
  if (gone.length) await db.update(productVariants).set({ active: false }).where(inArray(productVariants.id, gone));

  // Barcodes: replaced for this product's variants.
  const variantIds = [...kept, ...gone];
  if (variantIds.length) await db.delete(productBarcodes).where(and(eq(productBarcodes.restaurantId, restaurantId), inArray(productBarcodes.variantId, variantIds)));
  const idByKey = new Map<string, string>();
  const nowRows = await db.select().from(productVariants).where(eq(productVariants.dishId, dish.id));
  for (const r of nowRows) idByKey.set(comboKey(r.options, options), r.id);
  const barcodeRows = [...codes].map(([code, key]) => ({ restaurantId, dishId: dish.id, variantId: idByKey.get(key)!, code, symbology: checkBarcode(code).symbology, packQty: 1 }));
  if (barcodeRows.length) await db.insert(productBarcodes).values(barcodeRows);

  await db.update(dishes).set({ variantOptions: wantedCombos.length ? options : null }).where(eq(dishes.id, dish.id));
  return {};
}
