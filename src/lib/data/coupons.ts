import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { coupons } from "@/db/schema";

export async function listCoupons(restaurantId: string) {
  return db.select().from(coupons).where(eq(coupons.restaurantId, restaurantId)).orderBy(desc(coupons.createdAt));
}

export async function findActiveCoupon(restaurantId: string, code: string) {
  const [coupon] = await db
    .select()
    .from(coupons)
    .where(and(eq(coupons.restaurantId, restaurantId), eq(coupons.code, code.trim().toUpperCase())))
    .limit(1);
  if (!coupon || !coupon.active) return null;
  return coupon;
}
