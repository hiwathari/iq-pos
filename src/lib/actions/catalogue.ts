"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { categories, dishes, inventoryItems, productBarcodes } from "@/db/schema";
import { assertPermission, requireRestaurantContext } from "@/lib/scope";
import { listAccessibleSites } from "@/lib/data/sites";

// Central catalogue (docs/retail-plan step 6.7): the products of this site (the master) are
// pushed to the other sites as linked copies (`dishes.master_id`). Pushing again updates the
// copies' name, barcodes, VAT, cost and so on; a copy keeps its own price when the site is
// marked "keeps its own price" (local_price) or when "update prices" is off.
export interface PushResult {
  error?: string;
  created?: number;
  updated?: number;
  skipped?: string[];
}

export async function pushProductsAction(input: { dishIds: string[]; siteIds: string[]; updatePrices: boolean }): Promise<PushResult> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "manage-dishes");
  const accessible = await listAccessibleSites(session);
  const targets = accessible.filter((s) => s.id !== restaurantId && input.siteIds.includes(s.id));
  if (targets.length === 0) return { error: "Choose at least one other site you manage." };
  const ids = (Array.isArray(input.dishIds) ? input.dishIds : []).slice(0, 500);
  if (ids.length === 0) return { error: "Choose the products to push." };
  const masters = await db.select().from(dishes).where(and(eq(dishes.restaurantId, restaurantId), inArray(dishes.id, ids)));
  const sourceCats = await db.select().from(categories).where(eq(categories.restaurantId, restaurantId));
  const masterCodes = await db.select().from(productBarcodes).where(and(eq(productBarcodes.restaurantId, restaurantId), inArray(productBarcodes.dishId, ids)));
  let created = 0;
  let updated = 0;
  const skipped: string[] = [];

  for (const site of targets) {
    const siteCats = await db.select().from(categories).where(eq(categories.restaurantId, site.id));
    const siteDishes = await db.select().from(dishes).where(eq(dishes.restaurantId, site.id));
    for (const m of masters) {
      // Category by name at the destination (created like the master's if missing).
      const srcCat = sourceCats.find((c) => c.id === m.categoryId);
      let cat = siteCats.find((c) => c.name.toLowerCase() === (srcCat?.name ?? "").toLowerCase());
      if (!cat && srcCat) {
        const [made] = await db.insert(categories).values({ restaurantId: site.id, name: srcCat.name, icon: srcCat.icon, taxRatePercent: srcCat.taxRatePercent }).returning();
        cat = made;
        siteCats.push(made);
      }
      if (!cat) {
        skipped.push(`${m.name} (no category)`);
        continue;
      }
      // The linked copy, or an existing product at the site with the same SKU / a shared barcode.
      const codes = masterCodes.filter((c) => c.dishId === m.id && !c.variantId).map((c) => c.code);
      let copy = siteDishes.find((d) => d.masterId === m.id);
      if (!copy && m.sku) copy = siteDishes.find((d) => d.sku === m.sku);
      if (!copy && codes.length) {
        const [hit] = await db.select({ dishId: productBarcodes.dishId }).from(productBarcodes).where(and(eq(productBarcodes.restaurantId, site.id), inArray(productBarcodes.code, codes))).limit(1);
        if (hit) copy = siteDishes.find((d) => d.id === hit.dishId);
      }
      const shared = {
        categoryId: cat.id,
        name: m.name,
        emoji: m.emoji,
        color: m.color,
        description: m.description,
        sellBy: m.sellBy,
        unit: m.unit,
        minQty: m.minQty,
        qtyStep: m.qtyStep,
        tare: m.tare,
        brand: m.brand,
        costPrice: m.costPrice,
        taxRateOverride: m.taxRateOverride,
        minAge: m.minAge,
        plu: m.plu,
        tierPrices: m.tierPrices,
        masterId: m.id,
      };
      let dishId: string;
      if (copy) {
        const keepPrice = copy.localPrice || !input.updatePrices;
        await db.update(dishes).set({ ...shared, ...(keepPrice ? {} : { price: m.price }) }).where(eq(dishes.id, copy.id));
        dishId = copy.id;
        updated++;
      } else {
        const sku = m.sku && !siteDishes.some((d) => d.sku === m.sku) ? m.sku : null;
        const [made] = await db.insert(dishes).values({ restaurantId: site.id, ...shared, price: m.price, sku, trackStock: m.trackStock }).returning({ id: dishes.id });
        dishId = made.id;
        created++;
        // Own stock item at the new site (starts at 0) when the master tracks stock.
        if (m.trackStock) {
          const [it] = await db.insert(inventoryItems).values({ restaurantId: site.id, name: await freeName(site.id, m.name), unit: m.sellBy === "unit" ? "pcs" : m.unit, quantity: 0, lowStockThreshold: 0, dishId, costPrice: m.costPrice }).returning({ id: inventoryItems.id });
          await db.update(dishes).set({ inventoryItemId: it.id, inventoryUsagePerOrder: 1 }).where(eq(dishes.id, dishId));
        }
      }
      // Barcodes: the master's replace the copy's own (a code another product there already uses is skipped).
      if (codes.length) {
        await db.delete(productBarcodes).where(and(eq(productBarcodes.restaurantId, site.id), eq(productBarcodes.dishId, dishId)));
        const taken = await db.select({ code: productBarcodes.code }).from(productBarcodes).where(and(eq(productBarcodes.restaurantId, site.id), inArray(productBarcodes.code, codes)));
        const takenSet = new Set(taken.map((t) => t.code));
        const rows = masterCodes.filter((c) => c.dishId === m.id && !c.variantId && !takenSet.has(c.code)).map((c) => ({ restaurantId: site.id, dishId, code: c.code, symbology: c.symbology, packQty: c.packQty }));
        if (rows.length) await db.insert(productBarcodes).values(rows);
      }
    }
  }
  revalidatePath("/catalogue");
  return { created, updated, skipped };
}

async function freeName(restaurantId: string, name: string) {
  for (let n = 1; n < 50; n++) {
    const candidate = n === 1 ? name : `${name} (${n})`;
    const [hit] = await db.select({ id: inventoryItems.id }).from(inventoryItems).where(and(eq(inventoryItems.restaurantId, restaurantId), eq(inventoryItems.name, candidate))).limit(1);
    if (!hit) return candidate;
  }
  return `${name} (${crypto.randomUUID().slice(0, 4)})`;
}

// A site that keeps its own prices when the master changes (per product).
export async function setLocalPriceAction(dishId: string, local: boolean) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "manage-dishes");
  await db.update(dishes).set({ localPrice: local }).where(and(eq(dishes.id, dishId), eq(dishes.restaurantId, restaurantId)));
  revalidatePath("/catalogue");
}
