import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { restaurantAccess, restaurants } from "@/db/schema";
import type { SessionPayload } from "@/lib/session";

// The businesses ("sites") a login may act on (docs/retail-plan steps 6.5, 6.7, 6.8): a regional
// admin's assigned ones, every business for a Super Admin, and just its own for anyone else.
export async function listAccessibleSites(session: SessionPayload): Promise<{ id: string; name: string; slug: string }[]> {
  if (session.role === "super_admin") {
    return db.select({ id: restaurants.id, name: restaurants.name, slug: restaurants.slug }).from(restaurants).orderBy(restaurants.name);
  }
  if (session.role === "regional_admin") {
    const rows = await db.select({ id: restaurantAccess.restaurantId }).from(restaurantAccess).where(eq(restaurantAccess.userId, session.userId));
    if (rows.length === 0) return [];
    return db.select({ id: restaurants.id, name: restaurants.name, slug: restaurants.slug }).from(restaurants).where(inArray(restaurants.id, rows.map((r) => r.id))).orderBy(restaurants.name);
  }
  if (!session.restaurantId) return [];
  return db.select({ id: restaurants.id, name: restaurants.name, slug: restaurants.slug }).from(restaurants).where(eq(restaurants.id, session.restaurantId));
}

export async function canActOnSite(session: SessionPayload, restaurantId: string) {
  return (await listAccessibleSites(session)).some((s) => s.id === restaurantId);
}
