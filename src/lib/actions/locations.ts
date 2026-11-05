"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { inventoryItems, stockBatches, stockLevels, stockLocations } from "@/db/schema";
import { assertPermission, requireRestaurantContext } from "@/lib/scope";
import { applyStockChanges } from "@/lib/stock";
import { expiringBatches } from "@/lib/data/locations";

// Locations, put-away and bin-to-bin moves (step 6.1) and the expiry write-off (step 6.2).

export interface LocationInput {
  code: string;
  name?: string;
  kind: "zone" | "aisle" | "bin" | "shop_floor" | "backroom";
  parentId?: string | null;
  pickable?: boolean;
  sort?: number;
}

const KINDS = ["zone", "aisle", "bin", "shop_floor", "backroom"];

export async function saveLocationAction(id: string | null, input: LocationInput): Promise<{ error?: string }> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "locations");
  const code = String(input.code ?? "").trim().toUpperCase().slice(0, 30);
  if (!code) return { error: "Enter a code, e.g. A-03-2." };
  if (!KINDS.includes(input.kind)) return { error: "Choose what kind of location it is." };
  const values = { code, name: String(input.name ?? "").trim().slice(0, 80) || null, kind: input.kind, parentId: input.parentId || null, pickable: input.pickable !== false, sort: Math.max(0, Math.floor(Number(input.sort) || 0)) };
  const [clash] = await db.select({ id: stockLocations.id }).from(stockLocations).where(and(eq(stockLocations.restaurantId, restaurantId), eq(stockLocations.code, code))).limit(1);
  if (clash && clash.id !== id) return { error: `${code} already exists.` };
  if (id) await db.update(stockLocations).set(values).where(and(eq(stockLocations.id, id), eq(stockLocations.restaurantId, restaurantId)));
  else await db.insert(stockLocations).values({ restaurantId, ...values });
  revalidatePath("/locations");
  return {};
}

export async function deleteLocationAction(id: string): Promise<{ error?: string }> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "locations");
  const [loc] = await db.select({ id: stockLocations.id }).from(stockLocations).where(and(eq(stockLocations.id, id), eq(stockLocations.restaurantId, restaurantId))).limit(1);
  if (!loc) return {};
  const [held] = await db.select({ q: stockLevels.quantity }).from(stockLevels).where(and(eq(stockLevels.locationId, id), sql`${stockLevels.quantity} > 0.000001`)).limit(1);
  if (held) return { error: "There's still stock in this location — move it first." };
  await db.delete(stockLevels).where(eq(stockLevels.locationId, id));
  await db.update(stockLocations).set({ parentId: null }).where(and(eq(stockLocations.restaurantId, restaurantId), eq(stockLocations.parentId, id)));
  await db.delete(stockLocations).where(eq(stockLocations.id, id));
  revalidatePath("/locations");
  return {};
}

async function ownLocation(restaurantId: string, id: string) {
  const [row] = await db.select().from(stockLocations).where(and(eq(stockLocations.id, id), eq(stockLocations.restaurantId, restaurantId))).limit(1);
  return row ?? null;
}

// Put stock into a bin, or move it between bins (`fromLocationId` null = from "not yet put away").
// The item's total never changes; what's in bins can't pass the total.
export async function moveLocationStockAction(input: { itemId: string; fromLocationId?: string | null; toLocationId: string; qty: number }): Promise<{ error?: string }> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "locations");
  const qty = Math.round(Number(input.qty) * 1e6) / 1e6;
  if (!(qty > 0)) return { error: "Enter a quantity." };
  const [item] = await db.select().from(inventoryItems).where(and(eq(inventoryItems.id, input.itemId), eq(inventoryItems.restaurantId, restaurantId))).limit(1);
  if (!item) return { error: "That item no longer exists." };
  const to = await ownLocation(restaurantId, input.toLocationId);
  if (!to) return { error: "Choose where it's going." };
  const levels = await db.select().from(stockLevels).where(eq(stockLevels.inventoryItemId, item.id));
  const inBins = levels.reduce((s, l) => s + l.quantity, 0);
  if (input.fromLocationId) {
    const from = await ownLocation(restaurantId, input.fromLocationId);
    if (!from) return { error: "That bin no longer exists." };
    const here = levels.find((l) => l.locationId === from.id)?.quantity ?? 0;
    if (here + 1e-9 < qty) return { error: `Only ${Math.round(here * 1000) / 1000} ${item.unit} in ${from.code}.` };
    await db.update(stockLevels).set({ quantity: Math.round((here - qty) * 1e6) / 1e6 }).where(and(eq(stockLevels.inventoryItemId, item.id), eq(stockLevels.locationId, from.id)));
  } else if (Math.max(0, item.quantity) - inBins + 1e-9 < qty) {
    return { error: `Only ${Math.max(0, Math.round((item.quantity - inBins) * 1000) / 1000)} ${item.unit} not yet put away.` };
  }
  const there = levels.find((l) => l.locationId === to.id);
  if (there) await db.update(stockLevels).set({ quantity: Math.round((there.quantity + qty) * 1e6) / 1e6 }).where(and(eq(stockLevels.inventoryItemId, item.id), eq(stockLevels.locationId, to.id)));
  else await db.insert(stockLevels).values({ inventoryItemId: item.id, locationId: to.id, quantity: qty });
  await db.delete(stockLevels).where(and(eq(stockLevels.inventoryItemId, item.id), sql`${stockLevels.quantity} <= 0.000001`));
  revalidatePath("/locations");
  revalidatePath("/inventory");
  return {};
}

// One-tap write-off of an expired / expiring batch: the stock goes down as waste (Out of date).
export async function writeOffBatchAction(batchId: string): Promise<{ error?: string }> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "inventory");
  const [b] = await db.select().from(stockBatches).where(and(eq(stockBatches.id, batchId), eq(stockBatches.restaurantId, restaurantId))).limit(1);
  if (!b) return { error: "That batch no longer exists." };
  const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, b.inventoryItemId)).limit(1);
  const take = Math.min(b.quantity, Math.max(0, item?.quantity ?? 0));
  // Remove the batch first, then lower the total (the overlay trim then finds nothing extra to take).
  await db.delete(stockBatches).where(eq(stockBatches.id, batchId));
  if (take > 0) {
    await applyStockChanges(restaurantId, new Map([[b.inventoryItemId, -take]]), {
      reason: "waste",
      byName: session.name,
      note: `Out of date — ${b.lot ? `lot ${b.lot}, ` : ""}expired ${b.expiresOn ?? ""}`.trim(),
      unitCosts: item?.costPrice != null ? new Map([[b.inventoryItemId, item.costPrice]]) : undefined,
    });
  }
  revalidatePath("/inventory/expiry");
  revalidatePath("/inventory");
  return {};
}

export async function expiryRowsAction() {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "inventory");
  return expiringBatches(restaurantId);
}
