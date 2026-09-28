"use server";

// Server Actions reachable from the public internet with no staff session at all — the Till's
// placeOrderAction trusts a logged-in staff member's client; nothing here may make that same
// assumption. Every dish price is re-derived from the live menu server-side, every restaurant
// feature flag is re-checked, and a loyalty member is only ever attached from a source the
// customer can't forge (their verified session cookie, or a lookup keyed by contact value).

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { dishes, loyaltyMembers, orders, tables } from "@/db/schema";
import { getRestaurantBySlug } from "@/lib/data/restaurants";
import { findLoyaltyMemberByContact, findLoyaltyMemberById } from "@/lib/data/loyalty";
import { decrementInventoryForOrder, nextOrderNumber } from "@/lib/order-helpers";
import { generateLoyaltyCode } from "@/lib/loyalty-code";
import { LOYALTY_SESSION_COOKIE_NAME, verifyLoyaltySessionToken } from "@/lib/loyalty-session";
import type { LoyaltyContactType, OrderItem } from "@/lib/types";

async function getVerifiedLoyaltySession(restaurantId: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get(LOYALTY_SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await verifyLoyaltySessionToken(token);
  if (!session || session.restaurantId !== restaurantId) return null;
  return session;
}

export interface PublicOrderItemInput {
  dishId: string;
  qty: number;
  note?: string;
}

export interface PlacePublicOrderInput {
  restaurantSlug: string;
  placedVia: "online" | "kiosk";
  channel: "Dine in" | "Take Away";
  tableId?: string;
  guests?: number;
  items: PublicOrderItemInput[];
  customerName: string;
  customerPhone: string;
  // Only consulted for a "kiosk" order — resolved moments earlier by kioskLoyaltyLookupAction in
  // the same session, and re-validated against this restaurant below. An "online" order's
  // loyalty member always comes from the verified session cookie instead, never from client input.
  loyaltyMemberId?: string;
}

export interface PlacePublicOrderResult {
  error?: string;
  orderNumber?: string;
}

export async function placePublicOrderAction(input: PlacePublicOrderInput): Promise<PlacePublicOrderResult> {
  const restaurant = await getRestaurantBySlug(input.restaurantSlug);
  if (!restaurant || !restaurant.onlineOrderingEnabled) return { error: "Ordering isn't available for this restaurant." };
  if (input.placedVia === "kiosk" && !restaurant.kioskOrderingEnabled) return { error: "Kiosk ordering isn't enabled." };
  if (input.placedVia === "online" && input.channel === "Dine in" && !restaurant.qrTableOrderingEnabled) {
    return { error: "Table ordering isn't enabled." };
  }

  if (!Array.isArray(input.items) || input.items.length === 0) return { error: "Your cart is empty." };
  const customerName = input.customerName.trim().slice(0, 100);
  const customerPhone = input.customerPhone.trim().slice(0, 30);
  if (!customerName) return { error: "Enter your name." };
  if (!customerPhone) return { error: "Enter your phone number." };

  // Re-derive every item server-side from the live menu — dishId and qty are the only client
  // input trusted at all, and qty is clamped to a sane range.
  const dishIds = [...new Set(input.items.map((i) => String(i.dishId)))];
  const liveDishes = await db.select().from(dishes).where(and(eq(dishes.restaurantId, restaurant.id), inArray(dishes.id, dishIds)));
  const items: OrderItem[] = [];
  for (const raw of input.items) {
    const dish = liveDishes.find((d) => d.id === raw.dishId);
    if (!dish || dish.outOfStock) continue;
    const qty = Math.max(1, Math.min(50, Math.floor(Number(raw.qty) || 0)));
    if (qty <= 0) continue;
    const price = dish.channelPrices?.[input.channel] ?? dish.price;
    items.push({
      dishId: dish.id,
      name: dish.name,
      price,
      qty,
      note: raw.note?.trim().slice(0, 200) || undefined,
      lineId: crypto.randomUUID(),
    });
  }
  if (items.length === 0) return { error: "None of the items in your cart are available anymore." };

  let tableId: string | null = null;
  let tableNumber: number | null = null;
  if (input.channel === "Dine in" && input.tableId) {
    const [table] = await db.select().from(tables).where(and(eq(tables.id, input.tableId), eq(tables.restaurantId, restaurant.id))).limit(1);
    if (!table) return { error: "That table wasn't found." };
    tableId = table.id;
    tableNumber = table.number;
  }
  const guests = input.channel === "Dine in" ? Math.max(1, Math.min(30, Math.floor(input.guests || 1))) : 1;

  let loyaltyMemberId: string | null = null;
  if (input.placedVia === "online") {
    const session = await getVerifiedLoyaltySession(restaurant.id);
    loyaltyMemberId = session?.loyaltyMemberId ?? null;
  } else if (input.loyaltyMemberId) {
    const member = await findLoyaltyMemberById(restaurant.id, input.loyaltyMemberId);
    loyaltyMemberId = member?.id ?? null;
  }

  const orderNumber = await nextOrderNumber(restaurant.id);
  await db.insert(orders).values({
    id: crypto.randomUUID(),
    restaurantId: restaurant.id,
    orderNumber,
    tableId,
    tableNumber,
    guests,
    channel: input.channel,
    status: "In Kitchen",
    items,
    paymentMethod: null,
    customerName,
    customerPhone,
    loyaltyMemberId,
    placedVia: input.placedVia,
    createdByUserId: null,
    createdByName: input.placedVia === "kiosk" ? "Kiosk" : "Online Order",
    createdLabel: "Just now",
  });

  if (tableId) {
    await db.update(tables).set({ status: "on-dine", seated: guests, seatedAt: Date.now() }).where(eq(tables.id, tableId));
  }

  await decrementInventoryForOrder(restaurant.id, items);

  revalidatePath("/order-line");
  revalidatePath("/manage-table");
  revalidatePath("/dashboard");
  revalidatePath("/kitchen");

  return { orderNumber };
}

export interface KioskLoyaltyLookupState {
  error?: string;
  member?: { id: string; code: string; name: string | null };
}

// The kiosk's own loyalty lookup/enroll — deliberately separate from the Till's
// lookupOrCreateLoyaltyMemberAction (which requires a staff session): this one is reachable from
// an unattended public device, gated on kioskOrderingEnabled instead.
export async function kioskLoyaltyLookupAction(
  restaurantSlug: string,
  contactType: LoyaltyContactType,
  contactValue: string,
  name?: string
): Promise<KioskLoyaltyLookupState> {
  const restaurant = await getRestaurantBySlug(restaurantSlug);
  if (!restaurant || !restaurant.kioskOrderingEnabled) return { error: "Kiosk ordering isn't enabled." };

  const trimmed = contactType === "email" ? contactValue.trim().toLowerCase() : contactValue.trim();
  if (!trimmed) return { error: "Enter a phone number or email." };

  const existing = await findLoyaltyMemberByContact(restaurant.id, trimmed);
  if (existing) return { member: { id: existing.id, code: existing.code, name: existing.name } };

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateLoyaltyCode(restaurant.name);
    try {
      const [created] = await db
        .insert(loyaltyMembers)
        .values({ restaurantId: restaurant.id, contactType, contactValue: trimmed, name: name?.trim().slice(0, 100) || null, code })
        .returning();
      return { member: { id: created.id, code: created.code, name: created.name } };
    } catch (err) {
      if (attempt === 4) throw err;
    }
  }
  throw new Error("unreachable");
}
