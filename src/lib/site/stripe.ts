import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getSecretSetting, SETTING_STRIPE_KEY, SETTING_STRIPE_WEBHOOK } from "@/lib/platform-settings";

// Minimal Stripe client over fetch (no SDK). STRIPE_API_BASE exists only so tests can point it at a mock.
const base = () => process.env.STRIPE_API_BASE || "https://api.stripe.com";

export interface StripeSession {
  id: string;
  url: string | null;
  payment_status: "paid" | "unpaid" | "no_payment_required";
  status: string;
  metadata?: Record<string, string>;
  amount_total?: number;
}

async function call<T>(method: "GET" | "POST", path: string, body?: URLSearchParams): Promise<T> {
  const key = await getSecretSetting(SETTING_STRIPE_KEY);
  if (!key) throw new Error("Stripe isn't set up yet.");
  const res = await fetch(`${base()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & T;
  if (!res.ok) throw new Error(json?.error?.message || `Stripe error ${res.status}`);
  return json;
}

export async function stripeConfigured() {
  return !!(await getSecretSetting(SETTING_STRIPE_KEY));
}

export async function createCheckoutSession(input: {
  paymentId: string;
  projectId: string;
  title: string;
  amountPence: number;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<StripeSession> {
  const p = new URLSearchParams();
  p.set("mode", "payment");
  p.set("success_url", input.successUrl);
  p.set("cancel_url", input.cancelUrl);
  p.set("customer_email", input.customerEmail);
  p.set("client_reference_id", input.paymentId);
  p.set("line_items[0][quantity]", "1");
  p.set("line_items[0][price_data][currency]", "gbp");
  p.set("line_items[0][price_data][unit_amount]", String(input.amountPence));
  p.set("line_items[0][price_data][product_data][name]", input.title);
  p.set("metadata[payment_id]", input.paymentId);
  p.set("metadata[project_id]", input.projectId);
  return call<StripeSession>("POST", "/v1/checkout/sessions", p);
}

export async function retrieveCheckoutSession(id: string): Promise<StripeSession> {
  return call<StripeSession>("GET", `/v1/checkout/sessions/${encodeURIComponent(id)}`);
}

/** Verifies a webhook's `Stripe-Signature` header (HMAC-SHA256 over "<t>.<payload>", 5-minute tolerance). */
export async function verifyStripeSignature(payload: string, header: string | null): Promise<boolean> {
  const secret = await getSecretSetting(SETTING_STRIPE_WEBHOOK);
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = Number(parts.t);
  const sigs = header.split(",").filter((kv) => kv.startsWith("v1=")).map((kv) => kv.slice(3));
  if (!t || sigs.length === 0 || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return sigs.some((s) => s.length === expected.length && timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}
