import "server-only";

// Thin wrapper around Teya's POSLink API (https://docs.teya.com/poslink/overview) — the one that
// lets a server trigger a charge on a physical Teya card machine over the internet, rather than
// Teya's separate "ePOS SDK" which runs natively on the terminal's own Android OS.
//
// Two things here are this integration's unverified assumptions, same spirit as the SumUp
// integration's flagged affiliate-placement guess — both fail loud (a rejected request) rather
// than silently misbehaving if wrong:
//   - Credential scope: this treats teyaClientId/teyaClientSecret as issued per restaurant (like
//     SumUp's apiKey), set in that restaurant's own Settings. Teya's docs describe "obtaining a
//     client ID and secret" without clearly saying whether that's once per integrating platform
//     (IQ POS) or once per merchant — if it turns out to be platform-level, these three fields
//     move from `restaurants` to env vars, same shape as SUMUP_AFFILIATE_KEY.
//   - The payment-requests path itself: confirmed field names and status enum come from Teya's
//     own documented Elixir/PHP client libraries, but the exact REST path was reconstructed from
//     those libraries' internal route names, not read directly off an official reference page.
const TEYA_TOKEN_URL = "https://id.teya.com/oauth/v2/oauth-token";
const TEYA_API_BASE = "https://api.teya.com";

export class TeyaApiError extends Error {
  constructor(message: string, public status: number, public body: unknown) {
    super(message);
    this.name = "TeyaApiError";
  }
}

// No cross-request token caching — this runs in a stateless serverless function, so a fresh
// token is fetched on every call rather than relying on in-memory state that wouldn't survive
// between invocations anyway. Costs one extra round-trip per charge; correct over clever.
export async function getTeyaAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch(TEYA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" }).toString(),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new TeyaApiError(`Teya oauth-token failed (${res.status})`, res.status, json);
  return json.access_token as string;
}

async function teyaRequest<T>(accessToken: string, method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${TEYA_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new TeyaApiError(`Teya ${method} ${path} failed (${res.status})`, res.status, json);
  }
  return json as T;
}

// Teya's own documented status enum (NEW -> IN_PROGRESS -> SUCCESSFUL | FAILED | CANCELLED) —
// unlike SumUp/myPOS this one came fully confirmed, so no guessing needed on the mapping.
export type TeyaPaymentStatus = "NEW" | "IN_PROGRESS" | "SUCCESSFUL" | "FAILED" | "CANCELLED";

export interface TeyaPaymentResult {
  payment_request_id: string;
  status: TeyaPaymentStatus;
}

// Starts a charge on a terminal — the customer taps/inserts/swipes on the physical device
// itself; this call only confirms Teya accepted the request. referenceNumber is capped at 60
// chars per Teya's documented merchant_reference field.
export async function createTeyaPayment(
  accessToken: string,
  storeId: string,
  terminalId: string,
  amount: number,
  currency: string,
  referenceNumber: string
): Promise<TeyaPaymentResult> {
  return teyaRequest<TeyaPaymentResult>(accessToken, "POST", "/poslink/payment-requests", {
    store_id: storeId,
    terminal_id: terminalId,
    requested_amount: { amount: Math.round(amount * 100), currency },
    transaction_type: "SALE",
    merchant_reference: referenceNumber.slice(0, 60),
  });
}

export interface TeyaPaymentDetail {
  payment_request_id: string;
  status: TeyaPaymentStatus;
  failure_reason?: string;
}

export async function getTeyaPaymentStatus(accessToken: string, paymentRequestId: string): Promise<TeyaPaymentDetail> {
  return teyaRequest<TeyaPaymentDetail>(accessToken, "GET", `/poslink/payment-requests/${paymentRequestId}`);
}

// Best-effort cancel of an in-flight payment request (e.g. staff backed out of the "waiting for
// card" screen) — swallows failures since Teya's own terminal-side timeout will clear a stuck
// request if this doesn't land, rather than leaving the Till stuck.
export async function cancelTeyaPayment(accessToken: string, paymentRequestId: string): Promise<void> {
  try {
    await teyaRequest(accessToken, "PATCH", `/poslink/payment-requests/${paymentRequestId}`, { status: "CANCELLED" });
  } catch {
    // Best effort — see comment above.
  }
}
