import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { dishes, orders, restaurantAccess, restaurants, tables, users } from "@/db/schema";

// restaurantIds, when given, scopes the list to a regional_admin's assigned restaurants instead
// of every restaurant on the platform.
export async function listRestaurantsWithStats(restaurantIds?: string[]) {
  if (restaurantIds && restaurantIds.length === 0) return [];
  const rows = restaurantIds
    ? await db.select().from(restaurants).where(inArray(restaurants.id, restaurantIds)).orderBy(restaurants.createdAt)
    : await db.select().from(restaurants).orderBy(restaurants.createdAt);

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

export async function getRestaurantBySlug(slug: string) {
  const [row] = await db.select().from(restaurants).where(eq(restaurants.slug, slug)).limit(1);
  return row ?? null;
}

// Used by proxy.ts to map a request's Host header to a tenant when it isn't the platform's own
// domain — i.e. a restaurant's custom ordering domain/subdomain.
export async function getRestaurantByCustomDomain(domain: string) {
  const [row] = await db.select().from(restaurants).where(eq(restaurants.customDomain, domain)).limit(1);
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

export async function listAssignedRestaurantIds(userId: string) {
  const rows = await db.select({ restaurantId: restaurantAccess.restaurantId }).from(restaurantAccess).where(eq(restaurantAccess.userId, userId));
  return rows.map((r) => r.restaurantId);
}

// Every regional_admin account plus the restaurants they can currently see/manage — for the
// true super_admin's own "Regional Admins" panel, where access is granted/revoked.
export async function listRegionalAdmins() {
  const admins = await db.select().from(users).where(eq(users.role, "regional_admin")).orderBy(users.createdAt);
  const access = await db.select().from(restaurantAccess);
  const allRestaurants = await db.select({ id: restaurants.id, name: restaurants.name }).from(restaurants);
  const restaurantNameById = new Map(allRestaurants.map((r) => [r.id, r.name]));

  return admins.map((a) => {
    const restaurantIds = access.filter((row) => row.userId === a.id).map((row) => row.restaurantId);
    return {
      id: a.id,
      name: a.name,
      email: a.email,
      active: a.active,
      restaurantIds,
      restaurantNames: restaurantIds.map((id) => restaurantNameById.get(id) ?? "Unknown"),
    };
  });
}
