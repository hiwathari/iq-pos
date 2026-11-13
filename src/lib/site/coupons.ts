import "server-only";
import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { siteCouponRedemptions, siteCoupons } from "@/db/schema";
import { listPence, priceAfterCoupon, type PurchaseKind } from "./builder-pricing";

export type SiteCoupon = typeof siteCoupons.$inferSelect;

export const normaliseCode = (code: string) => code.trim().toUpperCase().replace(/\s+/g, "");

/** Why a coupon can't be used right now, or null when it can. */
export function couponProblem(coupon: SiteCoupon | undefined | null, kind: PurchaseKind, now = Date.now()): string | null {
  if (!coupon || !coupon.active) return "That code isn't valid.";
  if (coupon.expiresAt !== null && coupon.expiresAt <= now) return "That code has expired.";
  if (coupon.maxUses !== null && coupon.uses >= coupon.maxUses) return "That code has been used up.";
  if (coupon.appliesTo !== "any" && coupon.appliesTo !== kind) return coupon.appliesTo === "build" ? "That code only works for the first build." : "That code only works for changes.";
  return null;
}

export async function findCoupon(code: string): Promise<SiteCoupon | null> {
  const clean = normaliseCode(code);
  if (!clean) return null;
  const [row] = await db.select().from(siteCoupons).where(eq(siteCoupons.code, clean)).limit(1);
  return row ?? null;
}

export async function checkCoupon(code: string, kind: PurchaseKind): Promise<{ ok: true; coupon: SiteCoupon; amountPence: number } | { ok: false; error: string }> {
  const coupon = await findCoupon(code);
  const problem = couponProblem(coupon, kind);
  if (problem || !coupon) return { ok: false, error: problem ?? "That code isn't valid." };
  return { ok: true, coupon, amountPence: priceAfterCoupon(listPence(kind), coupon) };
}

/**
 * Counts one use of a coupon — atomically, so a limit of N really is N even when several people pay at once.
 * Idempotent per payment (a payment is only ever counted once). Returns false when the limit was hit first.
 */
export async function redeemCoupon(couponId: string, paymentId: string, projectId: string): Promise<boolean> {
  const [already] = await db.select({ id: siteCouponRedemptions.id }).from(siteCouponRedemptions).where(eq(siteCouponRedemptions.paymentId, paymentId)).limit(1);
  if (already) return true;
  const now = Date.now();
  const updated = await db
    .update(siteCoupons)
    .set({ uses: sql`${siteCoupons.uses} + 1` })
    .where(
      and(
        eq(siteCoupons.id, couponId),
        eq(siteCoupons.active, true),
        or(isNull(siteCoupons.maxUses), lt(siteCoupons.uses, siteCoupons.maxUses)),
        or(isNull(siteCoupons.expiresAt), gt(siteCoupons.expiresAt, now))
      )
    )
    .returning({ id: siteCoupons.id });
  if (updated.length === 0) return false;
  await db.insert(siteCouponRedemptions).values({ couponId, paymentId, projectId }).onConflictDoNothing();
  return true;
}
