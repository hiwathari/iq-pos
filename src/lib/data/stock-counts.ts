import { and, desc, eq, gt, inArray, isNull, ne, or } from "drizzle-orm";
import { db } from "@/db/client";
import { stockCountLines, stockCounts, stockMovements } from "@/db/schema";

export async function listStockCounts(restaurantId: string) {
  const [counts, lines] = await Promise.all([
    db.select().from(stockCounts).where(eq(stockCounts.restaurantId, restaurantId)).orderBy(desc(stockCounts.createdAt)),
    db
      .select({ countId: stockCountLines.stockCountId, counted: stockCountLines.counted })
      .from(stockCountLines)
      .innerJoin(stockCounts, eq(stockCounts.id, stockCountLines.stockCountId))
      .where(eq(stockCounts.restaurantId, restaurantId)),
  ]);
  const total = new Map<string, number>();
  const done = new Map<string, number>();
  for (const l of lines) {
    total.set(l.countId, (total.get(l.countId) ?? 0) + 1);
    if (l.counted != null) done.set(l.countId, (done.get(l.countId) ?? 0) + 1);
  }
  return counts.map((c) => ({ ...c, lineCount: total.get(c.id) ?? 0, countedCount: done.get(c.id) ?? 0 }));
}

export interface CountLineView {
  id: string;
  inventoryItemId: string;
  name: string;
  unit: string;
  costPrice: number | null;
  expected: number;
  counted: number | null;
  countedByName: string | null;
  // What the system said was on the shelf at the moment it was counted: the snapshot plus every
  // sale / delivery / adjustment between the snapshot and then (so selling during a count doesn't
  // show up as missing stock).
  systemAtCount: number | null;
  variance: number | null;
}

export async function getStockCount(restaurantId: string, id: string) {
  const [count] = await db.select().from(stockCounts).where(and(eq(stockCounts.restaurantId, restaurantId), eq(stockCounts.id, id))).limit(1);
  if (!count) return null;
  const lines = await db.select().from(stockCountLines).where(eq(stockCountLines.stockCountId, id));
  const ids = lines.map((l) => l.inventoryItemId);
  const moves = ids.length
    ? await db
        .select({ itemId: stockMovements.inventoryItemId, change: stockMovements.change, at: stockMovements.createdAt })
        .from(stockMovements)
        .where(
          and(
            eq(stockMovements.restaurantId, restaurantId),
            inArray(stockMovements.inventoryItemId, ids),
            gt(stockMovements.createdAt, count.createdAt),
            // A posted count's own movements aren't part of what happened before it was counted.
            or(isNull(stockMovements.referenceId), ne(stockMovements.referenceId, id))
          )
        )
    : [];
  const byItem = new Map<string, { change: number; at: number }[]>();
  for (const m of moves) byItem.set(m.itemId, [...(byItem.get(m.itemId) ?? []), { change: m.change, at: m.at }]);

  const views: CountLineView[] = lines
    .map((l) => {
      let systemAtCount: number | null = null;
      let variance: number | null = null;
      if (l.counted != null) {
        const since = (byItem.get(l.inventoryItemId) ?? []).filter((m) => m.at <= (l.countedAt ?? Infinity)).reduce((s, m) => s + m.change, 0);
        systemAtCount = Math.round((l.expected + since) * 1000) / 1000;
        variance = Math.round((l.counted - systemAtCount) * 1000) / 1000;
      }
      return {
        id: l.id,
        inventoryItemId: l.inventoryItemId,
        name: l.name,
        unit: l.unit,
        costPrice: l.costPrice,
        expected: l.expected,
        counted: l.counted,
        countedByName: l.countedByName,
        systemAtCount,
        variance,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return { ...count, lines: views };
}
