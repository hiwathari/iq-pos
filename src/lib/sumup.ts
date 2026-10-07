import "server-only";

// Thin wrapper around SumUp's Cloud API (https://developer.sumup.com/terminal-payments/cloud-api)
// — the one that lets a server trigger a charge on a physical Solo reader over the internet,
// rather than the native Bluetooth/USB SDKs that only work from the same device as the terminal.
//
// Every restaurant authorizes with its own SumUp account (apiKey + merchantCode, set in Settings),
// while SUMUP_AFFILIATE_APP_ID/SUMUP_AFFILIATE_KEY below are IQ POS's own platform-level
// affiliate credentials (one pair, shared across every restaurant) — SumUp uses these to track
// volume/attribute it to this integration, not to authorize any one merchant's payments.
//
// The exact placement of the affiliate object in the checkout request body — a sibling of
// total_amount/return_url, as used here — is this integration's one unverified assumption (SumUp's
// own docs showed two different shapes for it on different pages). Confirm against a sandbox
// checkout before relying on this in production; if it's wrong, SumUp will reject the request
// with a 4xx rather than silently misbehave, so it fails loud either way.
const SUMUP_API_BASE = "https://api.sumup.com/v0.1";

export class SumupApiError extends Error {
  constructor(message: string, public status: number, public body: unknown) {
    super(message);
    this.name = "SumupApiError";
  }
}

async function sumupRequest<T>(
  apiKey: string,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${SUMUP_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new SumupApiError(`SumUp ${method} ${path} failed (${res.status})`, res.status, json);
  }
  return json as T;
}

export interface SumupReader {
  id: string;
  name: string;
  status: "unknown" | "processing" | "paired" | "expired";
  device?: { identifier: string; model: string };
}

// Pairs a physical Solo reader to this merchant account — `pairingCode` is the 8-9 character
// code the reader itself displays when pairing mode is started on the device.
export async function createSumupReader(
  merchantCode: string,
  apiKey: string,
  pairingCode: string,
  name: string
): Promise<SumupReader> {
  return sumupRequest<SumupReader>(apiKey, "POST", `/merchants/${merchantCode}/readers`, {
    pairing_code: pairingCode,
    name,
  });
}

export interface SumupCheckoutResult {
  checkout_id: string;
  client_transaction_id: string;
  status: "pending" | "successful" | "failed" | "cancelled";
}

// Starts a charge on a paired reader — the customer taps/inserts/swipes on the physical device
// itself; this call only confirms SumUp accepted the request, not that the payment succeeded
// (see getSumupCheckoutStatus / the webhook route for the actual result).
export async function createSumupCheckout(
  merchantCode: string,
  apiKey: string,
  readerId: string,
  amount: number,
  currency: string,
  returnUrl: string
): Promise<SumupCheckoutResult> {
  const affiliateAppId = process.env.SUMUP_AFFILIATE_APP_ID;
  const affiliateKey = process.env.SUMUP_AFFILIATE_KEY;
  return sumupRequest<SumupCheckoutResult>(apiKey, "POST", `/merchants/${merchantCode}/readers/${readerId}/checkout`, {
    total_amount: {
      currency,
      minor_unit: 2,
      value: Math.round(amount * 100),
    },
    return_url: returnUrl,
    ...(affiliateAppId && affiliateKey ? { affiliate: { app_id: affiliateAppId, key: affiliateKey } } : {}),
  });
}

export interface SumupCheckoutStatus {
  checkout_id: string;
  client_transaction_id: string;
  status: "pending" | "successful" | "failed" | "cancelled";
  payment_failure_reason?: string;
  total_amount: { currency: string; minor_unit: number; value: number };
}

export async function getSumupCheckoutStatus(
  merchantCode: string,
  apiKey: string,
  readerId: string,
  checkoutId: string
): Promise<SumupCheckoutStatus> {
  const res = await sumupRequest<{ data: SumupCheckoutStatus }>(
    apiKey,
    "GET",
    `/merchants/${merchantCode}/readers/${readerId}/checkout/${checkoutId}`
  );
  return res.data;
}

// Best-effort cancel of an in-flight checkout (e.g. staff backed out of the "waiting for card"
// screen) — swallows failures since the checkout will simply time out on SumUp's side (their own
// 60-second reader-activation window) if this doesn't land, rather than leaving the Till stuck.
export async function terminateSumupCheckout(
  merchantCode: string,
  apiKey: string,
  readerId: string,
  checkoutId: string
): Promise<void> {
  try {
    await sumupRequest(apiKey, "DELETE", `/merchants/${merchantCode}/readers/${readerId}/checkout/${checkoutId}`);
  } catch {
    // Best effort — see comment above.
  }
}
