import { NextRequest, NextResponse } from "next/server";
import { getSumupCheckoutByCheckoutId, getSumupCheckoutByClientTransactionId, refreshSumupCheckoutStatus } from "@/lib/data/sumup";

// SumUp's own docs don't document a webhook signature (no HMAC secret/header named) — and
// explicitly say to always verify a delivered event by calling their API rather than trusting
// its payload, which is exactly what refreshSumupCheckoutStatus does. So this route only ever
// uses the payload to find which checkout to re-check, never to decide its outcome; a forged or
// malformed POST here can at most trigger a redundant, harmless re-check of a real checkout.
//
// The exact field names below (checkout_id / client_transaction_id, nested under `payload` or
// top-level) are this integration's other unverified assumption — SumUp's docs showed different
// shapes for this on different pages. Confirm against a real sandbox webhook delivery; worst
// case a shape mismatch just means this route finds nothing and no-ops, since the Till's own
// polling (pollSumupChargeAction) reaches the same true status independently either way.
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({}, { status: 200 });
  }

  const payload = (body.payload as Record<string, unknown>) ?? body;
  const checkoutId = typeof payload.checkout_id === "string" ? payload.checkout_id : null;
  const clientTransactionId = typeof payload.client_transaction_id === "string" ? payload.client_transaction_id : null;

  const row = checkoutId
    ? await getSumupCheckoutByCheckoutId(checkoutId)
    : clientTransactionId
      ? await getSumupCheckoutByClientTransactionId(clientTransactionId)
      : null;
  if (!row) return NextResponse.json({}, { status: 200 });

  try {
    await refreshSumupCheckoutStatus(row);
  } catch {
    // A genuine failure to reach SumUp here is worth a retry — SumUp retries a non-2xx at
    // 1m/5m/20m/2h — but the Till's own polling will likely reach the true status first anyway.
    return NextResponse.json({}, { status: 500 });
  }
  return NextResponse.json({}, { status: 200 });
}
