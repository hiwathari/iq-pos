import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { dishes, promotions } from "@/db/schema";
import { applyPromotions, stripPromo, type PromotionDef } from "@/lib/promotions";
import type { OrderItem } from "@/lib/types";

export type PromotionRow = typeof promotions.$inferSelect;

export const toPromotionDef = (r: PromotionRow): PromotionDef => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  rules: r.rules,
  startsAt: r.startsAt,
  endsAt: r.endsAt,
  active: r.active,
  channels: r.channels,
});

export async function listPromotions(restaurantId: string) {
  return db.select().from(promotions).where(eq(promotions.restaurantId, restaurantId)).orderBy(desc(promotions.createdAt));
}

export async function listActivePromotionDefs(restaurantId: string): Promise<PromotionDef[]> {
  const rows = await db.select().from(promotions).where(and(eq(promotions.restaurantId, restaurantId), eq(promotions.active, true)));
  return rows.map(toPromotionDef);
}

// The server's own pricing of a basket: whatever promo fields the client sent are dropped and
// recomputed from the live promotions and the products' real categories.
export async function priceItemsWithPromotions(restaurantId: string, items: OrderItem[], channel: string): Promise<OrderItem[]> {
  const defs = await listActivePromotionDefs(restaurantId);
  if (defs.length === 0) return items.map(stripPromo);
  const ids = [...new Set(items.map((i) => i.dishId))].filter((id) => !id.startsWith("custom:"));
  const rows = ids.length
    ? await db.select({ id: dishes.id, categoryId: dishes.categoryId }).from(dishes).where(and(eq(dishes.restaurantId, restaurantId), inArray(dishes.id, ids)))
    : [];
  const cat = new Map(rows.map((r) => [r.id, r.categoryId]));
  return applyPromotions(items, defs, { now: Date.now(), channel, categoryOf: (id) => cat.get(id) ?? null }).items;
}
