"use server";

import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { categories, dishes, inventoryItems, productBarcodes, restaurants, suppliers } from "@/db/schema";
import { assertPermission, requireRestaurantContext } from "@/lib/scope";
import type { CategoryDisplayOverride } from "@/lib/types";
import { checkBarcode, makeInternalEan13 } from "@/lib/barcode";
import { isSellBy, isUnitFor, stockUnitFor, type SellBy } from "@/lib/units";
import { applyStockChanges } from "@/lib/stock";
import { saveVariantsForDish, type VariantInput } from "@/lib/variants-server";
import { cleanOptions, combinations } from "@/lib/variants";

export interface CreateCategoryInput {
  name: string;
  printerId: string | null;
  kitchenDisplayStation: CategoryDisplayOverride;
  taxRatePercent: number;
}

export async function createCategoryAction(input: CreateCategoryInput) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "manage-dishes");
  if (!input.name.trim()) return;
  await db.insert(categories).values({
    id: crypto.randomUUID(),
    restaurantId,
    name: input.name.trim(),
    icon: "all",
    printerId: input.printerId,
    kitchenDisplayStation: input.kitchenDisplayStation,
    taxRatePercent: input.taxRatePercent,
  });
  revalidatePath("/manage-dishes");
  revalidatePath("/order-line");
}

export interface UpdateCategoryInput {
  name: string;
  printerId: string | null;
  kitchenDisplayStation: CategoryDisplayOverride;
  taxRatePercent: number;
}

export async function updateCategoryAction(categoryId: string, input: UpdateCategoryInput) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "manage-dishes");
  if (!input.name.trim()) return;
  await db
    .update(categories)
    .set({
      name: input.name.trim(),
      printerId: input.printerId,
      kitchenDisplayStation: input.kitchenDisplayStation,
      taxRatePercent: input.taxRatePercent,
    })
    .where(and(eq(categories.id, categoryId), eq(categories.restaurantId, restaurantId)));
  revalidatePath("/manage-dishes");
  revalidatePath("/order-line");
}

export interface DeleteCategoryState {
  error?: string;
}

// Refuses to delete a category that still has dishes in it, rather than silently cascading
// (the DB foreign key on dishes.categoryId is ON DELETE CASCADE, so an unguarded delete here
// would wipe every dish in the category with no way back) — the admin has to move or delete
// those dishes first, same "fix the real problem, don't paper over it" shape as
// setTillReceiptPrinterAction's local-IP guard.
export async function deleteCategoryAction(categoryId: string): Promise<DeleteCategoryState> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "manage-dishes");
  const remainingDishes = await db
    .select({ id: dishes.id })
    .from(dishes)
    .where(and(eq(dishes.categoryId, categoryId), eq(dishes.restaurantId, restaurantId)));
  if (remainingDishes.length > 0) {
    return {
      error: `This category still has ${remainingDishes.length} dish${remainingDishes.length === 1 ? "" : "es"} in it. Move or delete them first.`,
    };
  }
  await db.delete(categories).where(and(eq(categories.id, categoryId), eq(categories.restaurantId, restaurantId)));
  revalidatePath("/manage-dishes");
  revalidatePath("/order-line");
  return {};
}

export interface DishInput {
  name: string;
  categoryId: string;
  price: number;
  emoji: string;
  description: string;
  imageUrl?: string;
  printerId?: string | null;
  inventoryItemId?: string | null;
  inventoryUsagePerOrder?: number | null;
  // Retail fields (all optional so older callers keep working).
  sellBy?: SellBy;
  unit?: string;
  minQty?: number | null;
  qtyStep?: number | null;
  tare?: number | null;
  sku?: string;
  brand?: string;
  costPrice?: number | null;
  taxRateOverride?: number | null;
  minAge?: number | null;
  // Item code a weighing scale prints inside its labels (step 3.2).
  plu?: string;
  // Who it's bought from, and their code for it (step 4.4).
  supplierId?: string | null;
  supplierCode?: string;
  barcodes?: { code: string; packQty: number }[];
  // Variants (step 5.1): the options and every combination's own SKU / barcode / price / stock.
  variantOptions?: { name: string; values: string[] }[];
  variants?: VariantInput[];
  trackSerials?: boolean;
  // Own stock (step 2.4): when on, the product gets its own stock item; stockQty sets how many
  // are in stock now (a change is logged as a count), lowStock its low-stock level.
  trackStock?: boolean;
  stockQty?: number | null;
  lowStock?: number | null;
}

export interface DishActionResult {
  error?: string;
}

const MIN_AGES = [16, 18, 21, 25];
const optNum = (v: unknown, min = 0, max = 1e7) => {
  const n = typeof v === "number" ? v : v === null || v === undefined || v === "" ? NaN : Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

// Cleans and checks everything the product form sends. Returns the columns to write plus the
// checked barcodes, or an error to show on the form.
async function normaliseDishInput(restaurantId: string, input: DishInput, dishId: string | null) {
  const name = String(input.name ?? "").trim().slice(0, 120);
  if (!name) return { error: "Enter a name." } as const;
  const price = optNum(input.price, 0, 1e6);
  if (price === null) return { error: "Enter a valid price." } as const;
  const sellBy: SellBy = isSellBy(input.sellBy) ? input.sellBy : "unit";
  const unit = isUnitFor(sellBy, input.unit) ? input.unit : sellBy === "unit" ? "each" : sellBy === "weight" ? "kg" : sellBy === "volume" ? "l" : "m";
  const sku = String(input.sku ?? "").trim().slice(0, 64) || null;
  const taxRateOverride = optNum(input.taxRateOverride, 0, 100);
  let supplierId: string | null = null;
  if (input.supplierId) {
    const [sup] = await db.select({ id: suppliers.id }).from(suppliers).where(and(eq(suppliers.id, input.supplierId), eq(suppliers.restaurantId, restaurantId))).limit(1);
    supplierId = sup?.id ?? null;
  }
  const minAge = input.minAge && MIN_AGES.includes(Number(input.minAge)) ? Number(input.minAge) : null;

  const seen = new Set<string>();
  const barcodes: { code: string; symbology: "ean13" | "ean8" | "upca" | "gtin14" | "code128"; packQty: number }[] = [];
  for (const b of (Array.isArray(input.barcodes) ? input.barcodes : []).slice(0, 20)) {
    const check = checkBarcode(String(b?.code ?? ""));
    if (!check.code) continue;
    if (!check.ok) return { error: `Barcode ${check.code}: ${check.message}` } as const;
    if (seen.has(check.code)) continue;
    seen.add(check.code);
    barcodes.push({ code: check.code, symbology: check.symbology, packQty: optNum(b?.packQty, 0.001, 10000) ?? 1 });
  }
  if (barcodes.length) {
    const taken = await db
      .select({ code: productBarcodes.code, dishName: dishes.name, dishId: productBarcodes.dishId })
      .from(productBarcodes)
      .innerJoin(dishes, eq(dishes.id, productBarcodes.dishId))
      .where(and(eq(productBarcodes.restaurantId, restaurantId), inArray(productBarcodes.code, barcodes.map((b) => b.code))));
    const clash = taken.find((t) => t.dishId !== dishId);
    if (clash) return { error: `Barcode ${clash.code} is already used by ${clash.dishName}.` } as const;
  }
  if (sku) {
    const [skuTaken] = await db
      .select({ name: dishes.name })
      .from(dishes)
      .where(and(eq(dishes.restaurantId, restaurantId), eq(dishes.sku, sku), dishId ? ne(dishes.id, dishId) : undefined))
      .limit(1);
    if (skuTaken) return { error: `SKU ${sku} is already used by ${skuTaken.name}.` } as const;
  }

  const values = {
    name,
    categoryId: input.categoryId,
    price,
    emoji: input.emoji,
    description: input.description || null,
    imageUrl: input.imageUrl?.trim() || null,
    printerId: input.printerId ?? null,
    sellBy,
    unit,
    minQty: sellBy === "unit" ? null : optNum(input.minQty, 0, 1e4),
    qtyStep: sellBy === "unit" ? null : optNum(input.qtyStep, 0, 1e4),
    tare: sellBy === "unit" ? null : optNum(input.tare, 0, 1e4),
    sku,
    brand: String(input.brand ?? "").trim().slice(0, 80) || null,
    costPrice: optNum(input.costPrice, 0, 1e6),
    taxRateOverride,
    minAge,
    plu: String(input.plu ?? "").replace(/\D/g, "").slice(0, 6) || null,
    trackSerials: !!input.trackSerials,
    supplierId,
    supplierCode: String(input.supplierCode ?? "").trim().slice(0, 60) || null,
    // A product with variants keeps its stock per variant, not on the product itself.
    trackStock: !!input.trackStock && combinations(cleanOptions(input.variantOptions)).length === 0,
  };
  return { values, barcodes } as const;
}

async function saveBarcodes(restaurantId: string, dishId: string, barcodes: { code: string; symbology: "ean13" | "ean8" | "upca" | "gtin14" | "code128"; packQty: number }[]) {
  // Only the product's own barcodes — variants keep theirs (saveVariantsForDish).
  await db.delete(productBarcodes).where(and(eq(productBarcodes.restaurantId, restaurantId), eq(productBarcodes.dishId, dishId), isNull(productBarcodes.variantId)));
  if (barcodes.length) await db.insert(productBarcodes).values(barcodes.map((b) => ({ restaurantId, dishId, ...b })));
}

// Step 2.4: a product with "Track stock" on gets its own stock item (inventory_items.dish_id),
// named and counted in step with the product; the dish uses 1 of it per unit sold. Turning
// tracking off unlinks it (the item and its history stay on the Inventory page).
async function syncProductStock(
  restaurantId: string,
  dish: { id: string; name: string; sellBy: SellBy; unit: string; costPrice: number | null; supplierId: string | null; trackStock: boolean },
  input: DishInput,
  byName: string
) {
  const [own] = await db
    .select()
    .from(inventoryItems)
    .where(and(eq(inventoryItems.restaurantId, restaurantId), eq(inventoryItems.dishId, dish.id), isNull(inventoryItems.variantId)))
    .limit(1);
  if (!dish.trackStock) {
    await db.update(dishes).set({ inventoryItemId: input.inventoryItemId || null, inventoryUsagePerOrder: input.inventoryItemId ? input.inventoryUsagePerOrder || null : null }).where(eq(dishes.id, dish.id));
    return;
  }
  const unit = stockUnitFor(dish.sellBy, dish.unit);
  const lowStock = optNum(input.lowStock, 0, 1e7) ?? 0;
  let itemId = own?.id;
  if (own) {
    await db
      .update(inventoryItems)
      .set({ name: await freeItemName(restaurantId, dish.name, own.id), unit, lowStockThreshold: lowStock, costPrice: dish.costPrice, supplierId: dish.supplierId })
      .where(eq(inventoryItems.id, own.id));
  } else {
    const [created] = await db
      .insert(inventoryItems)
      .values({ restaurantId, name: await freeItemName(restaurantId, dish.name, null), unit, quantity: 0, lowStockThreshold: lowStock, dishId: dish.id, costPrice: dish.costPrice, supplierId: dish.supplierId })
      .returning({ id: inventoryItems.id });
    itemId = created.id;
  }
  await db.update(dishes).set({ inventoryItemId: itemId, inventoryUsagePerOrder: 1 }).where(eq(dishes.id, dish.id));
  const wanted = optNum(input.stockQty, -1e7, 1e7);
  if (wanted !== null && itemId) {
    const current = own?.quantity ?? 0;
    if (Math.abs(wanted - current) > 1e-9) {
      await applyStockChanges(restaurantId, new Map([[itemId, wanted - current]]), {
        reason: own ? "count" : "opening",
        byName,
        note: own ? "Set in the product form" : null,
      });
    }
  }
}

// inventory_items names are unique per business: reuse the product name, adding " (2)" etc. if
// an ingredient already has it.
async function freeItemName(restaurantId: string, name: string, selfId: string | null) {
  for (let n = 1; n < 50; n++) {
    const candidate = n === 1 ? name : `${name} (${n})`;
    const [hit] = await db
      .select({ id: inventoryItems.id })
      .from(inventoryItems)
      .where(and(eq(inventoryItems.restaurantId, restaurantId), eq(inventoryItems.name, candidate)))
      .limit(1);
    if (!hit || hit.id === selfId) return candidate;
  }
  return `${name} (${crypto.randomUUID().slice(0, 4)})`;
}

export async function createDishAction(input: DishInput): Promise<DishActionResult> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "manage-dishes");
  const checked = await normaliseDishInput(restaurantId, input, null);
  if ("error" in checked) return { error: checked.error };
  const id = crypto.randomUUID();
  await db.insert(dishes).values({ id, restaurantId, color: "#DCEEE8", ...checked.values });
  await saveBarcodes(restaurantId, id, checked.barcodes);
  await syncProductStock(restaurantId, { id, ...checked.values }, input, session.name);
  const vres = await saveVariantsForDish(restaurantId, { id, name: checked.values.name, supplierId: checked.values.supplierId }, input.variantOptions, input.variants, session.name);
  revalidateProducts();
  return vres.error ? { error: vres.error } : {};
}

export async function updateDishAction(dishId: string, input: DishInput): Promise<DishActionResult> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "manage-dishes");
  const [existing] = await db.select({ id: dishes.id }).from(dishes).where(and(eq(dishes.id, dishId), eq(dishes.restaurantId, restaurantId))).limit(1);
  if (!existing) return { error: "That product no longer exists." };
  const checked = await normaliseDishInput(restaurantId, input, dishId);
  if ("error" in checked) return { error: checked.error };
  await db.update(dishes).set(checked.values).where(eq(dishes.id, dishId));
  await saveBarcodes(restaurantId, dishId, checked.barcodes);
  await syncProductStock(restaurantId, { id: dishId, ...checked.values }, input, session.name);
  const vres = await saveVariantsForDish(restaurantId, { id: dishId, name: checked.values.name, supplierId: checked.values.supplierId }, input.variantOptions, input.variants, session.name);
  revalidateProducts();
  return vres.error ? { error: vres.error } : {};
}

// "Make a barcode": the business's next own EAN-13 (prefix 20). The counter only moves forward,
// so a code is never handed out twice even if the form is cancelled.
export async function nextInternalBarcodeAction(): Promise<{ code?: string; error?: string }> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "manage-dishes");
  for (let tries = 0; tries < 20; tries++) {
    const [row] = await db
      .update(restaurants)
      .set({ barcodeSeq: sql`${restaurants.barcodeSeq} + 1` })
      .where(eq(restaurants.id, restaurantId))
      .returning({ seq: restaurants.barcodeSeq });
    if (!row) return { error: "Business not found." };
    const code = makeInternalEan13(row.seq);
    const [taken] = await db
      .select({ id: productBarcodes.id })
      .from(productBarcodes)
      .where(and(eq(productBarcodes.restaurantId, restaurantId), eq(productBarcodes.code, code)))
      .limit(1);
    if (!taken) return { code };
  }
  return { error: "Couldn't make a free barcode — try again." };
}

// After printing labels: remembered so "Never printed only" can find products still without one.
export async function markLabelsPrintedAction(dishIds: string[]) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "manage-dishes");
  const ids = (Array.isArray(dishIds) ? dishIds : []).filter((id) => typeof id === "string").slice(0, 2000);
  if (!ids.length) return;
  await db.update(dishes).set({ labelPrintedAt: Date.now() }).where(and(eq(dishes.restaurantId, restaurantId), inArray(dishes.id, ids)));
  revalidatePath("/manage-dishes/labels");
}

function revalidateProducts() {
  revalidatePath("/manage-dishes");
  revalidatePath("/order-line");
  revalidatePath("/inventory");
}

export async function deleteDishAction(dishId: string) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "manage-dishes");
  await db.delete(dishes).where(and(eq(dishes.id, dishId), eq(dishes.restaurantId, restaurantId)));
  // Its own stock item (if it tracked stock) stays on the Inventory page with its history, as a
  // plain stock item; delete it there if it's no longer needed.
  await db
    .update(inventoryItems)
    .set({ dishId: null })
    .where(and(eq(inventoryItems.restaurantId, restaurantId), eq(inventoryItems.dishId, dishId)));
  revalidateProducts();
}

// Toggled from the Till or the Kitchen Display when an item runs out mid-service — deliberately
// not admin-only, since it's the floor/kitchen staff who notice and need to act immediately.
export async function setDishStockAction(dishId: string, outOfStock: boolean) {
  const { restaurantId } = await requireRestaurantContext();
  await db
    .update(dishes)
    .set({ outOfStock })
    .where(and(eq(dishes.id, dishId), eq(dishes.restaurantId, restaurantId)));
  revalidatePath("/order-line");
  revalidatePath("/kitchen");
  revalidatePath("/manage-dishes");
}

export async function setChannelPriceAction(dishId: string, channel: string, price: number | null) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "pricing");
  const [dish] = await db.select().from(dishes).where(and(eq(dishes.id, dishId), eq(dishes.restaurantId, restaurantId)));
  if (!dish) return;
  const next = { ...(dish.channelPrices ?? {}) };
  if (price === null || Number.isNaN(price)) delete next[channel];
  else next[channel] = price;
  await db
    .update(dishes)
    .set({ channelPrices: next })
    .where(and(eq(dishes.id, dishId), eq(dishes.restaurantId, restaurantId)));
  revalidatePath("/pricing");
  revalidatePath("/order-line");
}
