"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { paymentTerminals, restaurants, sumupCheckouts } from "@/db/schema";
import { assertPermission, requireRestaurantContext } from "@/lib/scope";
import { getRestaurant } from "@/lib/data/restaurants";
import { getSumupCheckoutByCheckoutId, refreshSumupCheckoutStatus } from "@/lib/data/sumup";
import { currencySymbolToIsoCode } from "@/lib/types";
import { createSumupReader, createSumupCheckout, terminateSumupCheckout, SumupApiError } from "@/lib/sumup";

function webhookUrl() {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${base}/api/webhooks/sumup`;
}

export async function saveSumupCredentialsAction(apiKey: string, merchantCode: string) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "settings");
  await db
    .update(restaurants)
    .set({ sumupApiKey: apiKey.trim() || null, sumupMerchantCode: merchantCode.trim() || null })
    .where(eq(restaurants.id, restaurantId));
  revalidatePath("/settings");
}

export interface PairSumupReaderState {
  error?: string;
}

// Pairs a physical Solo reader to this terminal — `pairingCode` is the 8-9 character code the
// reader itself shows once pairing mode is started on the device.
export async function pairSumupReaderAction(terminalId: string, pairingCode: string): Promise<PairSumupReaderState> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "settings");

  const restaurant = await getRestaurant(restaurantId);
  if (!restaurant?.sumupApiKey || !restaurant?.sumupMerchantCode) {
    return { error: "Connect this restaurant's SumUp account first." };
  }
  const [terminal] = await db
    .select()
    .from(paymentTerminals)
    .where(and(eq(paymentTerminals.id, terminalId), eq(paymentTerminals.restaurantId, restaurantId)))
    .limit(1);
  if (!terminal) return { error: "Terminal not found." };

  const trimmedCode = pairingCode.trim().toUpperCase();
  if (!trimmedCode) return { error: "Enter the pairing code shown on the reader." };

  try {
    const reader = await createSumupReader(restaurant.sumupMerchantCode, restaurant.sumupApiKey, trimmedCode, terminal.name);
    const status = reader.status === "paired" || reader.status === "processing" || reader.status === "expired" ? reader.status : "processing";
    await db
      .update(paymentTerminals)
      .set({ provider: "sumup", sumupReaderId: reader.id, sumupReaderStatus: status })
      .where(eq(paymentTerminals.id, terminalId));
  } catch (err) {
    if (err instanceof SumupApiError) {
      return {
        error: err.status === 404 ? "No reader is waiting with that pairing code." : "SumUp rejected the pairing — check the code and try again.",
      };
    }
    return { error: "Couldn't reach SumUp. Try again." };
  }

  revalidatePath("/settings");
  return {};
}

// Reverts a terminal back to plain "manual" mode — staff runs the physical machine themselves
// and just logs the amount, same as any non-integrated terminal. Doesn't touch SumUp's own
// reader record, only this terminal's link to it.
export async function unpairSumupReaderAction(terminalId: string) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "settings");
  await db
    .update(paymentTerminals)
    .set({ provider: null, sumupReaderId: null, sumupReaderStatus: null })
    .where(and(eq(paymentTerminals.id, terminalId), eq(paymentTerminals.restaurantId, restaurantId)));
  revalidatePath("/settings");
}

export interface StartSumupChargeState {
  checkoutId?: string;
  error?: string;
}

// Starts a charge on the reader this terminal is paired to — no "settings" gate, same as placing
// an order itself: any Till/staff session that can reach this terminal's button can charge it.
export async function startSumupChargeAction(terminalId: string, amount: number): Promise<StartSumupChargeState> {
  const { restaurantId } = await requireRestaurantContext();

  const restaurant = await getRestaurant(restaurantId);
  if (!restaurant?.sumupApiKey || !restaurant?.sumupMerchantCode) return { error: "SumUp isn't connected for this restaurant." };
  const isoCode = currencySymbolToIsoCode(restaurant.currencySymbol);
  if (!isoCode) return { error: "This restaurant's currency isn't supported by SumUp yet." };

  const [terminal] = await db
    .select()
    .from(paymentTerminals)
    .where(and(eq(paymentTerminals.id, terminalId), eq(paymentTerminals.restaurantId, restaurantId)))
    .limit(1);
  if (!terminal || terminal.provider !== "sumup" || !terminal.sumupReaderId) {
    return { error: "This terminal isn't connected to a SumUp reader." };
  }

  const clamped = Math.round(Math.abs(amount) * 100) / 100;
  if (clamped <= 0) return { error: "Enter an amount greater than 0." };

  try {
    const result = await createSumupCheckout(
      restaurant.sumupMerchantCode,
      restaurant.sumupApiKey,
      terminal.sumupReaderId,
      clamped,
      isoCode,
      webhookUrl()
    );
    await db.insert(sumupCheckouts).values({
      id: crypto.randomUUID(),
      restaurantId,
      paymentTerminalId: terminalId,
      checkoutId: result.checkout_id,
      clientTransactionId: result.client_transaction_id,
      amount: clamped,
      currency: isoCode,
      status: "pending",
    });
    return { checkoutId: result.checkout_id };
  } catch (err) {
    if (err instanceof SumupApiError) return { error: "SumUp couldn't start the charge — is the reader online?" };
    return { error: "Couldn't reach SumUp. Try again." };
  }
}

export interface PollSumupChargeState {
  status: "pending" | "successful" | "failed" | "cancelled";
  failureReason?: string | null;
  error?: string;
}

// Polled by the Till's "waiting for card" screen every couple of seconds — always re-fetches the
// true status from SumUp itself (never trusts a stored row past "pending"), the same thing the
// webhook route does, so whichever of the two gets there first wins and the other is a no-op.
export async function pollSumupChargeAction(checkoutId: string): Promise<PollSumupChargeState> {
  const { restaurantId } = await requireRestaurantContext();
  const row = await getSumupCheckoutByCheckoutId(checkoutId);
  if (!row || row.restaurantId !== restaurantId) return { status: "failed", error: "Charge not found." };

  try {
    const status = await refreshSumupCheckoutStatus(row);
    return { status: status ?? "pending", failureReason: row.failureReason };
  } catch {
    return { status: "pending" };
  }
}

// Staff backed out of the "waiting for card" screen — best-effort cancel on SumUp's side (see
// terminateSumupCheckout), and always marks our own row cancelled either way so the Till can
// stop polling it.
export async function cancelSumupChargeAction(checkoutId: string) {
  const { restaurantId } = await requireRestaurantContext();
  const row = await getSumupCheckoutByCheckoutId(checkoutId);
  if (!row || row.restaurantId !== restaurantId || row.status !== "pending") return;

  const restaurant = await getRestaurant(restaurantId);
  const [terminal] = await db.select().from(paymentTerminals).where(eq(paymentTerminals.id, row.paymentTerminalId)).limit(1);
  if (restaurant?.sumupApiKey && restaurant?.sumupMerchantCode && terminal?.sumupReaderId) {
    await terminateSumupCheckout(restaurant.sumupMerchantCode, restaurant.sumupApiKey, terminal.sumupReaderId, checkoutId);
  }
  await db.update(sumupCheckouts).set({ status: "cancelled", updatedAt: Date.now() }).where(eq(sumupCheckouts.id, row.id));
}
