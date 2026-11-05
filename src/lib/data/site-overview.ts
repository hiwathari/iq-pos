import "server-only";
import { and, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { inventoryItems, orders, restaurants, stockTransfers, tillDevices } from "@/db/schema";
import { businessDayStart } from "@/lib/business-day";
import { orderTotal } from "@/lib/types";

// Multi-site overview (docs/retail-plan step 6.8): each site's takings today and over 7 days,
// stock value at cost, transfers in flight and tills registered against its plan.
export const PLAN_TILL_LIMIT: Record<string, number | null> = { basic: 1, standard: 3, premium: null };

export interface SiteOverview {
  id: string;
  name: string;
  businessType: string;
  plan: "basic" | "standard" | "premium" | null;
  today: number;
  week: number;
  ordersToday: number;
  stockValue: number;
  openTransfers: number;
  tills: { id: string; name: string; lastSeenAt: number | null }[];
  tillLimit: number | null;
}

export async function siteOverview(siteIds: string[]): Promise<SiteOverview[]> {
  if (siteIds.length === 0) return [];
  const rows = await db.select().from(restaurants).where(inArray(restaurants.id, siteIds));
  const now = Date.now();
  const weekAgo = now - 7 * 86400000;
  const [orderRows, itemRows, transfers, devices] = await Promise.all([
    db.select({ restaurantId: orders.restaurantId, createdAt: orders.createdAt, status: orders.status, items: orders.items, extraDiscount: orders.extraDiscount, couponDiscount: orders.couponDiscount }).from(orders).where(and(inArray(orders.restaurantId, siteIds), gte(orders.createdAt, weekAgo))),
    db.select({ restaurantId: inventoryItems.restaurantId, quantity: inventoryItems.quantity, costPrice: inventoryItems.costPrice }).from(inventoryItems).where(inArray(inventoryItems.restaurantId, siteIds)),
    db.select({ from: stockTransfers.fromRestaurantId, to: stockTransfers.toRestaurantId, status: stockTransfers.status }).from(stockTransfers),
    db.select().from(tillDevices).where(and(inArray(tillDevices.restaurantId, siteIds), eq(tillDevices.revoked, false))),
  ]);
  return rows.map((r) => {
    const dayStart = businessDayStart(now, r.openTime ?? null, r.timezone ?? "UTC");
    const mine = orderRows.filter((o) => o.restaurantId === r.id && o.status !== "Voided");
    return {
      id: r.id,
      name: r.name,
      businessType: r.businessType,
      plan: r.plan ?? null,
      today: mine.filter((o) => o.createdAt >= dayStart).reduce((s, o) => s + orderTotal(o), 0),
      week: mine.reduce((s, o) => s + orderTotal(o), 0),
      ordersToday: mine.filter((o) => o.createdAt >= dayStart).length,
      stockValue: itemRows.filter((i) => i.restaurantId === r.id).reduce((s, i) => s + Math.max(0, i.quantity) * (i.costPrice ?? 0), 0),
      openTransfers: transfers.filter((t) => t.status === "sent" && (t.from === r.id || t.to === r.id)).length,
      tills: devices.filter((d) => d.restaurantId === r.id).map((d) => ({ id: d.id, name: d.name, lastSeenAt: d.lastSeenAt })),
      tillLimit: r.plan ? (PLAN_TILL_LIMIT[r.plan] ?? null) : null,
    };
  });
}
