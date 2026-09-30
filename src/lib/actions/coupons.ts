"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { coupons } from "@/db/schema";
import { assertPermission, requireRestaurantContext } from "@/lib/scope";
import { findActiveCoupon } from "@/lib/data/coupons";
import { resolveCouponDiscount } from "@/lib/types";
import type { CouponType } from "@/lib/types";

export interface CouponFormState {
  error?: string;
}

export async function createCouponAction(input: { code: string; type: CouponType; value: number }): Promise<CouponFormState> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "coupons");

  const code = input.code.trim().toUpperCase();
  if (!code) return { error: "Enter a code." };
  if (!Number.isFinite(input.value) || input.value <= 0) return { error: "Enter a value greater than zero." };
  if (input.type === "percent" && input.value > 100) return { error: "A percentage discount can't exceed 100%." };

  const [existing] = await db
    .select({ id: coupons.id })
    .from(coupons)
    .where(and(eq(coupons.restaurantId, restaurantId), eq(coupons.code, code)))
    .limit(1);
  if (existing) return { error: `Code "${code}" already exists.` };

  await db.insert(coupons).values({ restaurantId, code, type: input.type, value: input.value });
  revalidatePath("/coupons");
  revalidatePath("/order-line");
  return {};
}

export async function toggleCouponActiveAction(couponId: string, active: boolean) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "coupons");
  await db.update(coupons).set({ active }).where(and(eq(coupons.id, couponId), eq(coupons.restaurantId, restaurantId)));
  revalidatePath("/coupons");
  revalidatePath("/order-line");
}

export async function deleteCouponAction(couponId: string) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "coupons");
  await db.delete(coupons).where(and(eq(coupons.id, couponId), eq(coupons.restaurantId, restaurantId)));
  revalidatePath("/coupons");
  revalidatePath("/order-line");
}

export interface ApplyCouponState {
  error?: string;
  code?: string;
  type?: CouponType;
  value?: number;
  discount?: number;
}

// Called live from the Till as staff type a code — resolves it against the current subtotal so
// the Till and the eventual placeOrderAction always compute the exact same discount amount.
export async function validateCouponAction(code: string, subtotal: number): Promise<ApplyCouponState> {
  const { restaurantId } = await requireRestaurantContext();
  const coupon = await findActiveCoupon(restaurantId, code);
  if (!coupon) return { error: "That code isn't valid." };

  const discount = resolveCouponDiscount(coupon, subtotal);
  return { code: coupon.code, type: coupon.type, value: coupon.value, discount };
}
