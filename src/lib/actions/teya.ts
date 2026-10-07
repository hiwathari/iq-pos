"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { paymentTerminals, restaurants, teyaPayments } from "@/db/schema";
import { assertPermission, requireRestaurantContext } from "@/lib/scope";
import { getRestaurant } from "@/lib/data/restaurants";
import { refreshTeyaPaymentStatus, getTeyaPaymentByRequestId } from "@/lib/data/teya";
import { currencySymbolToIsoCode } from "@/lib/types";
import { getTeyaAccessToken, createTeyaPayment, cancelTeyaPayment, TeyaApiError } from "@/lib/teya";

export async function saveTeyaCredentialsAction(clientId: string, clientSecret: string, storeId: string) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "settings");
  await db
    .update(restaurants)
    .set({
      teyaClientId: clientId.trim() || null,
      teyaClientSecret: clientSecret.trim() || null,
      teyaStoreId: storeId.trim() || null,
    })
    .where(eq(restaurants.id, restaurantId));
  revalidatePath("/settings");
}

export interface ConnectTeyaTerminalState {
  error?: string;
}

// Unlike SumUp's pairing-code flow, Teya's terminals are pre-registered devices the restaurant
// already has an id for from their own Teya account — so this just validates the restaurant's
// credentials actually work (by fetching a real access token) before saving the pasted id.
export async function connectTeyaTerminalAction(terminalId: string, teyaTerminalId: string): Promise<ConnectTeyaTerminalState> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "settings");

  const restaurant = await getRestaurant(restaurantId);
  if (!restaurant?.teyaClientId || !restaurant?.teyaClientSecret || !restaurant?.teyaStoreId) {
    return { error: "Connect this restaurant's Teya account first." };
  }
  const trimmedId = teyaTerminalId.trim();
  if (!trimmedId) return { error: "Enter this terminal's Teya terminal id." };

  try {
    await getTeyaAccessToken(restaurant.teyaClientId, restaurant.teyaClientSecret);
  } catch (err) {
    if (err instanceof TeyaApiError) return { error: "Teya rejected these credentials — check them in Settings above." };
    return { error: "Couldn't reach Teya. Try again." };
  }

  await db
    .update(paymentTerminals)
    .set({ provider: "teya", teyaTerminalId: trimmedId })
    .where(and(eq(paymentTerminals.id, terminalId), eq(paymentTerminals.restaurantId, restaurantId)));
  revalidatePath("/settings");
  return {};
}

// Reverts a terminal back to plain "manual" mode — staff runs the physical machine themselves
// and just logs the amount, same as any non-integrated terminal.
export async function disconnectTeyaTerminalAction(terminalId: string) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "settings");
  await db
    .update(paymentTerminals)
    .set({ provider: null, teyaTerminalId: null })
    .where(and(eq(paymentTerminals.id, terminalId), eq(paymentTerminals.restaurantId, restaurantId)));
  revalidatePath("/settings");
}

export interface StartTeyaChargeState {
  paymentRequestId?: string;
  error?: string;
}

// Starts a charge on the terminal this row is connected to — no "settings" gate, same as placing
// an order itself: any Till/staff session that can reach this terminal's button can charge it.
export async function startTeyaChargeAction(terminalId: string, amount: number): Promise<StartTeyaChargeState> {
  const { restaurantId } = await requireRestaurantContext();

  const restaurant = await getRestaurant(restaurantId);
  if (!restaurant?.teyaClientId || !restaurant?.teyaClientSecret || !restaurant?.teyaStoreId) {
    return { error: "Teya isn't connected for this restaurant." };
  }
  const isoCode = currencySymbolToIsoCode(restaurant.currencySymbol);
  if (!isoCode) return { error: "This restaurant's currency isn't supported by Teya yet." };

  const [terminal] = await db
    .select()
    .from(paymentTerminals)
    .where(and(eq(paymentTerminals.id, terminalId), eq(paymentTerminals.restaurantId, restaurantId)))
    .limit(1);
  if (!terminal || terminal.provider !== "teya" || !terminal.teyaTerminalId) {
    return { error: "This terminal isn't connected to Teya." };
  }

  const clamped = Math.round(Math.abs(amount) * 100) / 100;
  if (clamped <= 0) return { error: "Enter an amount greater than 0." };

  try {
    const accessToken = await getTeyaAccessToken(restaurant.teyaClientId, restaurant.teyaClientSecret);
    const result = await createTeyaPayment(accessToken, restaurant.teyaStoreId, terminal.teyaTerminalId, clamped, isoCode, crypto.randomUUID());
    await db.insert(teyaPayments).values({
      id: crypto.randomUUID(),
      restaurantId,
      paymentTerminalId: terminalId,
      paymentRequestId: result.payment_request_id,
      amount: clamped,
      currency: isoCode,
      status: "pending",
    });
    return { paymentRequestId: result.payment_request_id };
  } catch (err) {
    if (err instanceof TeyaApiError) return { error: "Teya couldn't start the charge — is the terminal online?" };
    return { error: "Couldn't reach Teya. Try again." };
  }
}

export interface PollTeyaChargeState {
  status: "pending" | "successful" | "failed" | "cancelled";
  failureReason?: string | null;
  error?: string;
}

// Polled by the Till's "waiting for card" screen every couple of seconds — always re-fetches the
// true status from Teya itself (never trusts a stored row past "pending").
export async function pollTeyaChargeAction(paymentRequestId: string): Promise<PollTeyaChargeState> {
  const { restaurantId } = await requireRestaurantContext();
  const row = await getTeyaPaymentByRequestId(paymentRequestId);
  if (!row || row.restaurantId !== restaurantId) return { status: "failed", error: "Charge not found." };

  try {
    const status = await refreshTeyaPaymentStatus(row);
    return { status: status ?? "pending", failureReason: row.failureReason };
  } catch {
    return { status: "pending" };
  }
}

// Staff backed out of the "waiting for card" screen — best-effort cancel on Teya's side, and
// always marks our own row cancelled either way so the Till can stop polling it.
export async function cancelTeyaChargeAction(paymentRequestId: string) {
  const { restaurantId } = await requireRestaurantContext();
  const row = await getTeyaPaymentByRequestId(paymentRequestId);
  if (!row || row.restaurantId !== restaurantId || row.status !== "pending") return;

  const restaurant = await getRestaurant(restaurantId);
  if (restaurant?.teyaClientId && restaurant?.teyaClientSecret) {
    try {
      const accessToken = await getTeyaAccessToken(restaurant.teyaClientId, restaurant.teyaClientSecret);
      await cancelTeyaPayment(accessToken, paymentRequestId);
    } catch {
      // Best effort — see cancelTeyaPayment's own comment.
    }
  }
  await db.update(teyaPayments).set({ status: "cancelled", updatedAt: Date.now() }).where(eq(teyaPayments.id, row.id));
}
