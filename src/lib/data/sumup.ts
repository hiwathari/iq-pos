import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { paymentTerminals, sumupCheckouts } from "@/db/schema";
import { getRestaurant } from "@/lib/data/restaurants";
import { getSumupCheckoutStatus } from "@/lib/sumup";
import type { SumupCheckout } from "@/lib/types";

// checkoutId (SumUp's own id, not our row id) is unique platform-wide — see the schema comment —
// so this is the one lookup both pollSumupChargeAction and the webhook route need: given just
// the id SumUp hands back, find which restaurant/terminal/order it belongs to.
export async function getSumupCheckoutByCheckoutId(checkoutId: string) {
  const [row] = await db.select().from(sumupCheckouts).where(eq(sumupCheckouts.checkoutId, checkoutId)).limit(1);
  return row ?? null;
}

// The webhook route's fallback lookup — SumUp's own docs showed inconsistent field names for
// which id a delivered event actually carries, so it tries checkoutId first and this second.
export async function getSumupCheckoutByClientTransactionId(clientTransactionId: string) {
  const [row] = await db.select().from(sumupCheckouts).where(eq(sumupCheckouts.clientTransactionId, clientTransactionId)).limit(1);
  return row ?? null;
}

// Shared by pollSumupChargeAction (the Till's "waiting for card" screen) and the webhook route —
// whichever of the two gets here first wins, the other is a no-op. Always re-fetches the truth
// from SumUp's own Get Checkout endpoint rather than trusting a webhook payload's own status
// field, per SumUp's own documented guidance to verify every webhook against their API. Returns
// null if the restaurant/terminal's SumUp link is gone (disconnected since this checkout
// started) — the row is left "pending" rather than guessed at.
export async function refreshSumupCheckoutStatus(row: SumupCheckout): Promise<SumupCheckout["status"] | null> {
  if (row.status !== "pending") return row.status;

  const restaurant = await getRestaurant(row.restaurantId);
  const [terminal] = await db.select().from(paymentTerminals).where(eq(paymentTerminals.id, row.paymentTerminalId)).limit(1);
  if (!restaurant?.sumupApiKey || !restaurant?.sumupMerchantCode || !terminal?.sumupReaderId) return null;

  const live = await getSumupCheckoutStatus(restaurant.sumupMerchantCode, restaurant.sumupApiKey, terminal.sumupReaderId, row.checkoutId);
  if (live.status !== row.status) {
    await db
      .update(sumupCheckouts)
      .set({ status: live.status, failureReason: live.payment_failure_reason ?? null, updatedAt: Date.now() })
      .where(eq(sumupCheckouts.id, row.id));
  }
  return live.status;
}
