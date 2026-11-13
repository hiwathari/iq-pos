"use server";

import { headers } from "next/headers";
import { checkCoupon } from "@/lib/site/coupons";
import { BUILD_PENCE, CHANGE_PENCE, formatPence, type PurchaseKind } from "@/lib/site/builder-pricing";
import { beginPurchase, confirmPaymentById, getProject, runNextJob, saveManualEdit } from "@/lib/site/projects";

// Public actions for the customer studio (/site/studio/<token>). The token in the URL is the only credential,
// like an invoice link — it is 24 random characters and never listed anywhere.

async function studioBase() {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(":")[0].toLowerCase();
  const proto = h.get("x-forwarded-proto") ?? (host === "localhost" || host.endsWith(".localhost") ? "http" : "https");
  const port = (h.get("host") ?? "").split(":")[1];
  const origin = `${proto}://${host}${port && (host === "localhost" || host.endsWith(".localhost")) ? `:${port}` : ""}`;
  const onSiteHost = host === "iq.luvder.com" || host === "iq.localhost";
  return { origin, path: onSiteHost ? "/studio" : "/site/studio" };
}

export async function previewCouponAction(code: string, kind: PurchaseKind): Promise<{ ok: true; amountPence: number; label: string } | { ok: false; error: string }> {
  if (kind !== "build" && kind !== "change") return { ok: false, error: "Unknown purchase." };
  const checked = await checkCoupon(String(code ?? "").slice(0, 40), kind);
  if (!checked.ok) return checked;
  const list = kind === "build" ? BUILD_PENCE : CHANGE_PENCE;
  return { ok: true, amountPence: checked.amountPence, label: checked.amountPence === 0 ? "Free" : `${formatPence(checked.amountPence)} instead of ${formatPence(list)}` };
}

export async function startPurchaseAction(
  token: string,
  kind: PurchaseKind,
  options: { instruction?: string; coupon?: string }
): Promise<{ ok: true; redirect: string | null } | { ok: false; error: string }> {
  if (kind !== "build" && kind !== "change") return { ok: false, error: "Unknown purchase." };
  const project = await getProject(token);
  if (!project) return { ok: false, error: "We couldn't find your site." };
  const { origin, path } = await studioBase();
  const result = await beginPurchase(project, kind, {
    instruction: options.instruction,
    couponCode: options.coupon,
    successUrl: `${origin}${path}/${token}?pay={PAYMENT}`,
    cancelUrl: `${origin}${path}/${token}?cancelled=1`,
  });
  if (!result.ok) return result;
  return { ok: true, redirect: result.kind === "redirect" ? result.url : null };
}

/** The customer is back from Stripe: check the payment really went through. */
export async function confirmPaymentAction(token: string, paymentId: string): Promise<{ ok: boolean }> {
  const project = await getProject(token);
  if (!project) return { ok: false };
  try {
    return { ok: await confirmPaymentById(String(paymentId), project.id) };
  } catch (error) {
    console.error("[site-builder] confirm failed", error);
    return { ok: false };
  }
}

/** Runs whatever has been paid for and is waiting (the first build, or a change). */
export async function runJobAction(token: string): Promise<{ ok: true; ran: boolean } | { ok: false; error: string }> {
  return runNextJob(token);
}

export async function saveEditsAction(token: string, html: string, css: string): Promise<{ ok: boolean }> {
  if (typeof html !== "string" || typeof css !== "string") return { ok: false };
  return { ok: await saveManualEdit(token, html, css) };
}
