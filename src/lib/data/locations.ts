import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { inventoryItems, stockBatches, stockLevels, stockLocations } from "@/db/schema";

// Locations and bins (docs/retail-plan step 6.1). inventory_items.quantity is the total; the
// levels say where part of it sits; the rest is "unallocated" (not yet put away).

export async function listLocations(restaurantId: string) {
  return db.select().from(stockLocations).where(eq(stockLocations.restaurantId, restaurantId)).orderBy(asc(stockLocations.sort), asc(stockLocations.code));
}

export interface LocationContent {
  itemId: string;
  name: string;
  unit: string;
  quantity: number;
}

export async function listLocationContents(restaurantId: string): Promise<Record<string, LocationContent[]>> {
  const items = await db.select({ id: inventoryItems.id, name: inventoryItems.name, unit: inventoryItems.unit }).from(inventoryItems).where(eq(inventoryItems.restaurantId, restaurantId));
  const byId = new Map(items.map((i) => [i.id, i]));
  const locs = await db.select({ id: stockLocations.id }).from(stockLocations).where(eq(stockLocations.restaurantId, restaurantId));
  if (locs.length === 0) return {};
  const levels = await db.select().from(stockLevels).where(inArray(stockLevels.locationId, locs.map((l) => l.id)));
  const out: Record<string, LocationContent[]> = {};
  for (const l of levels) {
    const it = byId.get(l.inventoryItemId);
    if (!it || l.quantity <= 1e-9) continue;
    (out[l.locationId] ??= []).push({ itemId: it.id, name: it.name, unit: it.unit, quantity: l.quantity });
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

// Where an item sits, in walking order (location sort, then code) — for the Picking screen.
export async function levelsForItems(restaurantId: string, itemIds: string[]) {
  if (itemIds.length === 0) return new Map<string, { code: string; quantity: number; sort: number; pickable: boolean }[]>();
  const rows = await db
    .select({ itemId: stockLevels.inventoryItemId, quantity: stockLevels.quantity, code: stockLocations.code, sort: stockLocations.sort, pickable: stockLocations.pickable })
    .from(stockLevels)
    .innerJoin(stockLocations, eq(stockLocations.id, stockLevels.locationId))
    .where(and(eq(stockLocations.restaurantId, restaurantId), inArray(stockLevels.inventoryItemId, itemIds)));
  const out = new Map<string, { code: string; quantity: number; sort: number; pickable: boolean }[]>();
  for (const r of rows) out.set(r.itemId, [...(out.get(r.itemId) ?? []), { code: r.code, quantity: r.quantity, sort: r.sort, pickable: r.pickable }]);
  for (const list of out.values()) list.sort((a, b) => a.sort - b.sort || a.code.localeCompare(b.code));
  return out;
}

export async function expiringBatches(restaurantId: string) {
  const rows = await db
    .select({
      id: stockBatches.id,
      itemId: stockBatches.inventoryItemId,
      lot: stockBatches.lot,
      expiresOn: stockBatches.expiresOn,
      quantity: stockBatches.quantity,
      name: inventoryItems.name,
      unit: inventoryItems.unit,
      costPrice: inventoryItems.costPrice,
    })
    .from(stockBatches)
    .innerJoin(inventoryItems, eq(inventoryItems.id, stockBatches.inventoryItemId))
    .where(eq(stockBatches.restaurantId, restaurantId))
    .orderBy(asc(stockBatches.expiresOn));
  return rows.filter((r) => r.expiresOn && r.quantity > 1e-9) as (Omit<(typeof rows)[number], "expiresOn"> & { expiresOn: string })[];
}
