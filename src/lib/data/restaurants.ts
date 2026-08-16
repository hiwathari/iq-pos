import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { dishes, orders, restaurants, tables, users } from "@/db/schema";

export async function listRestaurantsWithStats() {
  const rows = await db.select().from(restaurants).orderBy(restaurants.createdAt);

  const [userCounts, dishCounts, tableCounts, orderCounts] = await Promise.all([
    db.select({ restaurantId: users.restaurantId, count: sql<number>`count(*)` }).from(users).groupBy(users.restaurantId),
    db.select({ restaurantId: dishes.restaurantId, count: sql<number>`count(*)` }).from(dishes).groupBy(dishes.restaurantId),
    db.select({ restaurantId: tables.restaurantId, count: sql<number>`count(*)` }).from(tables).groupBy(tables.restaurantId),
    db.select({ restaurantId: orders.restaurantId, count: sql<number>`count(*)` }).from(orders).groupBy(orders.restaurantId),
  ]);

  const toMap = (rows: { restaurantId: string | null; count: number }[]) =>
    new Map(rows.filter((r) => r.restaurantId).map((r) => [r.restaurantId as string, Number(r.count)]));

  const userMap = toMap(userCounts);
  const dishMap = toMap(dishCounts);
  const tableMap = toMap(tableCounts);
  const orderMap = toMap(orderCounts);

  return rows.map((r) => ({
    ...r,
    staffCount: userMap.get(r.id) ?? 0,
    dishCount: dishMap.get(r.id) ?? 0,
    tableCount: tableMap.get(r.id) ?? 0,
    orderCount: orderMap.get(r.id) ?? 0,
  }));
}

export async function getRestaurant(id: string) {
  const [row] = await db.select().from(restaurants).where(eq(restaurants.id, id)).limit(1);
  return row ?? null;
}

export async function platformTotals() {
  const [[{ restaurantCount }], [{ userCount }], [{ orderCount }]] = await Promise.all([
    db.select({ restaurantCount: sql<number>`count(*)` }).from(restaurants),
    db.select({ userCount: sql<number>`count(*)` }).from(users),
    db.select({ orderCount: sql<number>`count(*)` }).from(orders),
  ]);
  return {
    restaurantCount: Number(restaurantCount),
    userCount: Number(userCount),
    orderCount: Number(orderCount),
  };
}
