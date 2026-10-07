import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { paymentTerminals, teyaPayments } from "@/db/schema";
import { getRestaurant } from "@/lib/data/restaurants";
import { getTeyaAccessToken, getTeyaPaymentStatus, type TeyaPaymentStatus } from "@/lib/teya";
import type { TeyaPayment } from "@/lib/types";

export async function getTeyaPaymentByRequestId(paymentRequestId: string) {
  const [row] = await db.select().from(teyaPayments).where(eq(teyaPayments.paymentRequestId, paymentRequestId)).limit(1);
  return row ?? null;
}

// Teya's own documented enum (NEW/IN_PROGRESS/SUCCESSFUL/FAILED/CANCELLED) mapped onto the same
// pending/successful/failed/cancelled shape sumupCheckouts uses, so the Till's overlay can treat
// both providers identically.
function mapTeyaStatus(status: TeyaPaymentStatus): TeyaPayment["status"] {
  if (status === "NEW" || status === "IN_PROGRESS") return "pending";
  if (status === "SUCCESSFUL") return "successful";
  if (status === "CANCELLED") return "cancelled";
  return "failed";
}

// Polled by pollTeyaChargeAction (the Till's "waiting for card" screen) — Teya has no confirmed
// webhook/signature model, so this is the only path a charge's status ever gets updated by;
// always re-fetches the truth from Teya's own Get Payment Request endpoint.
export async function refreshTeyaPaymentStatus(row: TeyaPayment): Promise<TeyaPayment["status"] | null> {
  if (row.status !== "pending") return row.status;

  const restaurant = await getRestaurant(row.restaurantId);
  const [terminal] = await db.select().from(paymentTerminals).where(eq(paymentTerminals.id, row.paymentTerminalId)).limit(1);
  if (!restaurant?.teyaClientId || !restaurant?.teyaClientSecret || !terminal?.teyaTerminalId) return null;

  const accessToken = await getTeyaAccessToken(restaurant.teyaClientId, restaurant.teyaClientSecret);
  const live = await getTeyaPaymentStatus(accessToken, row.paymentRequestId);
  const status = mapTeyaStatus(live.status);
  if (status !== row.status) {
    await db
      .update(teyaPayments)
      .set({ status, failureReason: live.failure_reason ?? null, updatedAt: Date.now() })
      .where(eq(teyaPayments.id, row.id));
  }
  return status;
}
