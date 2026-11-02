"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { dishes, inventoryItems, stockCountLines, stockCounts } from "@/db/schema";
import { assertPermission, requireRestaurantContext } from "@/lib/scope";
import { getStockCount } from "@/lib/data/stock-counts";
import { applyStockChanges } from "@/lib/stock";

// Stocktake (docs/retail-plan step 4.6): start a count (all items or one category) — expected
// quantities are snapshotted — count by scanning or typing, review the differences at cost, then
// post: stock is set to what was counted, written as "count" movements against the stocktake.

export async function startStockCountAction(input: { name?: string; categoryId?: string | null }): Promise<{ error?: string; id?: string }> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "stocktake");

  let items = await db.select().from(inventoryItems).where(eq(inventoryItems.restaurantId, restaurantId));
  let scope = "all";
  if (input.categoryId) {
    const inCategory = await db
      .select({ id: dishes.id })
      .from(dishes)
      .where(and(eq(dishes.restaurantId, restaurantId), eq(dishes.categoryId, input.categoryId)));
    const dishIds = new Set(inCategory.map((d) => d.id));
    items = items.filter((i) => i.dishId && dishIds.has(i.dishId));
    scope = `category:${input.categoryId}`;
  }
  if (items.length === 0) return { error: "There's nothing to count in that selection." };

  const name = String(input.name ?? "").trim().slice(0, 80) || `Stocktake ${new Date().toISOString().slice(0, 10)}`;
  const [count] = await db.insert(stockCounts).values({ restaurantId, name, scope, startedByName: session.name }).returning({ id: stockCounts.id });
  // Chunked so a big shop's count (thousands of lines) stays within the statement size limits.
  const rows = items.map((i) => ({
    stockCountId: count.id,
    inventoryItemId: i.id,
    name: i.name,
    unit: i.unit,
    costPrice: i.costPrice,
    expected: i.quantity,
  }));
  for (let at = 0; at < rows.length; at += 200) await db.insert(stockCountLines).values(rows.slice(at, at + 200));
  revalidatePath("/stocktake");
  return { id: count.id };
}

export async function setCountedAction(countId: string, lineId: string, counted: number | null): Promise<{ error?: string }> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "stocktake");
  const [count] = await db.select({ status: stockCounts.status }).from(stockCounts).where(and(eq(stockCounts.id, countId), eq(stockCounts.restaurantId, restaurantId))).limit(1);
  if (!count) return { error: "That stocktake no longer exists." };
  if (count.status !== "open") return { error: "This stocktake is closed." };
  if (counted !== null && (!Number.isFinite(counted) || counted < 0 || counted > 1e9)) return { error: "Enter a valid quantity." };
  await db
    .update(stockCountLines)
    .set(counted === null ? { counted: null, countedByName: null, countedAt: null } : { counted: Math.round(counted * 1000) / 1000, countedByName: session.name, countedAt: Date.now() })
    .where(and(eq(stockCountLines.id, lineId), eq(stockCountLines.stockCountId, countId)));
  return {};
}

export async function postStockCountAction(countId: string): Promise<{ error?: string; changed?: number }> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "stocktake");
  const count = await getStockCount(restaurantId, countId);
  if (!count) return { error: "That stocktake no longer exists." };
  if (count.status !== "open") return { error: "This stocktake is already closed." };

  // Move stock by each line's difference (not to an absolute number) so sales made since the
  // item was counted stay in.
  const changes = new Map<string, number>();
  const costs = new Map<string, number>();
  for (const l of count.lines) {
    if (l.variance == null || Math.abs(l.variance) < 1e-9) continue;
    changes.set(l.inventoryItemId, l.variance);
    if (l.costPrice != null) costs.set(l.inventoryItemId, l.costPrice);
  }
  await applyStockChanges(restaurantId, changes, { reason: "count", referenceId: countId, byName: session.name, note: count.name ?? "Stocktake", unitCosts: costs });
  await db.update(stockCounts).set({ status: "posted", postedAt: Date.now() }).where(eq(stockCounts.id, countId));
  revalidatePath("/stocktake");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return { changed: changes.size };
}

export async function cancelStockCountAction(countId: string): Promise<{ error?: string }> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "stocktake");
  await db
    .update(stockCounts)
    .set({ status: "cancelled" })
    .where(and(eq(stockCounts.id, countId), eq(stockCounts.restaurantId, restaurantId), inArray(stockCounts.status, ["open"])));
  revalidatePath("/stocktake");
  return {};
}
