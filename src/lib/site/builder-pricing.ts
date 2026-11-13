// Website builder prices (GBP, in pence) and coupon maths — shared by the server and the studio page.
export const BUILD_PENCE = 499; // the first generation of a site
export const CHANGE_PENCE = 100; // each later AI change request

export type PurchaseKind = "build" | "change";

export const listPence = (kind: PurchaseKind) => (kind === "build" ? BUILD_PENCE : CHANGE_PENCE);

export const formatPence = (pence: number) => `£${(pence / 100).toFixed(2)}`;

export interface CouponTerms {
  percentOff: number | null;
  penceOff: number | null;
}

/** What the customer pays after a coupon (never below zero). */
export function priceAfterCoupon(list: number, coupon: CouponTerms | null): number {
  if (!coupon) return list;
  const off = coupon.percentOff ? Math.round((list * coupon.percentOff) / 100) : (coupon.penceOff ?? 0);
  return Math.max(0, list - off);
}
