"use server";

// Server Actions reachable from the public internet with no staff session at all — the Till's
// placeOrderAction trusts a logged-in staff member's client; nothing here may make that same
// assumption. Every dish price is re-derived from the live menu server-side, every restaurant
// feature flag is re-checked, and a loyalty member is only ever attached from a source the
// customer can't forge (their verified session cookie, or a lookup keyed by contact value).

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { dishes, loyaltyMembers, orders, tables } from "@/db/schema";
import { getRestaurant, getRestaurantBySlug } from "@/lib/data/restaurants";
import { resolveTableQrToken } from "@/lib/table-qr-token";
import { findLoyaltyMemberByContact, findLoyaltyMemberById } from "@/lib/data/loyalty";
import { decrementInventoryForOrder, nextOrderNumber } from "@/lib/order-helpers";
import { generateLoyaltyCode } from "@/lib/loyalty-code";
import { LOYALTY_SESSION_COOKIE_NAME, verifyLoyaltySessionToken } from "@/lib/loyalty-session";
import type { LoyaltyContactType, OrderItem } from "@/lib/types";

// Each submission mints a fresh lineId per item server-side (see the item-building loop below),
// so two submissions of the same cart never share lineIds — compare everything else instead.
function itemsMatchIgnoringLineId(a: OrderItem[], b: OrderItem[]) {
  if (a.length !== b.length) return false;
  return a.every(
    (item, i) =>
      item.dishId === b[i].dishId && item.qty === b[i].qty && item.price === b[i].price && (item.note || "") === (b[i].note || "")
  );
}

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

  const items = await buildItemsFromLiveMenu(restaurant.id, input.items, input.channel);
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

  const orderNumber = await insertPublicOrder({
    restaurantId: restaurant.id,
    placedVia: input.placedVia,
    createdByName: input.placedVia === "kiosk" ? "Kiosk" : "Online Order",
    channel: input.channel,
    tableId,
    tableNumber,
    guests,
    items,
    customerName,
    customerPhone,
    loyaltyMemberId,
  });
  return { orderNumber };
}

// Re-derive every item server-side from the live menu — dishId and qty are the only client
// input trusted at all, and qty is clamped to a sane range.
async function buildItemsFromLiveMenu(restaurantId: string, rawItems: PublicOrderItemInput[], channel: "Dine in" | "Take Away") {
  const dishIds = [...new Set(rawItems.map((i) => String(i.dishId)))];
  const liveDishes = await db.select().from(dishes).where(and(eq(dishes.restaurantId, restaurantId), inArray(dishes.id, dishIds)));
  const items: OrderItem[] = [];
  for (const raw of rawItems) {
    const dish = liveDishes.find((d) => d.id === raw.dishId);
    if (!dish || dish.outOfStock) continue;
    const qty = Math.max(1, Math.min(50, Math.floor(Number(raw.qty) || 0)));
    if (qty <= 0) continue;
    const price = dish.channelPrices?.[channel] ?? dish.price;
    items.push({
      dishId: dish.id,
      name: dish.name,
      price,
      qty,
      note: raw.note?.trim().slice(0, 200) || undefined,
      lineId: crypto.randomUUID(),
    });
  }
  return items;
}

interface PublicOrderRow {
  restaurantId: string;
  placedVia: "online" | "kiosk";
  createdByName: string;
  channel: "Dine in" | "Take Away";
  tableId: string | null;
  tableNumber: number | null;
  guests: number;
  items: OrderItem[];
  customerName: string;
  customerPhone: string;
  loyaltyMemberId: string | null;
}

// Shared by every public ordering surface: dedupes a double-tap, inserts the order straight into
// the kitchen queue, seats the table, and refreshes the staff screens. Returns the order number.
async function insertPublicOrder(row: PublicOrderRow) {
  // Guard against a customer double/triple-tapping "Place Order" on a slow connection and getting
  // charged or fed twice — if an identical order (same phone, channel/table, items) from this
  // same ordering surface was just placed in the last few seconds, hand back that one instead of
  // creating a duplicate.
  const dedupeCutoff = Date.now() - 8000;
  const recentOrders = await db
    .select({ orderNumber: orders.orderNumber, tableId: orders.tableId, channel: orders.channel, items: orders.items, customerPhone: orders.customerPhone })
    .from(orders)
    .where(and(eq(orders.restaurantId, row.restaurantId), eq(orders.placedVia, row.placedVia), gte(orders.createdAt, dedupeCutoff)));
  const duplicate = recentOrders.find(
    (o) =>
      o.channel === row.channel &&
      o.customerPhone === row.customerPhone &&
      o.tableId === row.tableId &&
      itemsMatchIgnoringLineId(o.items ?? [], row.items)
  );
  if (duplicate) return duplicate.orderNumber;

  const orderNumber = await nextOrderNumber(row.restaurantId);
  await db.insert(orders).values({
    id: crypto.randomUUID(),
    restaurantId: row.restaurantId,
    orderNumber,
    tableId: row.tableId,
    tableNumber: row.tableNumber,
    guests: row.guests,
    channel: row.channel,
    status: "In Kitchen",
    items: row.items,
    paymentMethod: null,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    loyaltyMemberId: row.loyaltyMemberId,
    placedVia: row.placedVia,
    createdByUserId: null,
    createdByName: row.createdByName,
    createdLabel: "Just now",
  });

  if (row.tableId) {
    await db.update(tables).set({ status: "on-dine", seated: row.guests, seatedAt: Date.now() }).where(eq(tables.id, row.tableId));
  }

  await decrementInventoryForOrder(row.restaurantId, row.items);

  revalidatePath("/order-line");
  revalidatePath("/manage-table");
  revalidatePath("/dashboard");
  revalidatePath("/kitchen");

  return orderNumber;
}

export interface PlaceTableQrOrderInput {
  token: string;
  items: PublicOrderItemInput[];
  guests: number;
  customerName: string;
  // Email or phone — whichever the customer typed. No verification: they're sat at the table.
  contact: string;
}

// Orders placed by scanning a table's QR code (see lib/table-qr-token.ts). No sign-in or email
// code — the customer is physically at the table — so the signed token is what's trusted: the
// table and restaurant both come from it, never from client input. To blunt a photographed QR
// being used to spam orders from off-premises, each table accepts a limited number of QR orders
// in a rolling window; staff still see every order on the Till/Kitchen Display as usual.
const QR_ORDER_LIMIT = 6;
const QR_ORDER_WINDOW_MS = 15 * 60_000;

export async function placeTableQrOrderAction(input: PlaceTableQrOrderInput): Promise<PlacePublicOrderResult> {
  const table = await resolveTableQrToken(String(input.token));
  if (!table) return { error: "This table's QR code isn't valid. Please ask a member of staff." };
  const restaurant = await getRestaurant(table.restaurantId);
  if (!restaurant || !restaurant.onlineOrderingEnabled || !restaurant.qrTableOrderingEnabled) {
    return { error: "Table ordering isn't available right now. Please order at the counter." };
  }

  if (!Array.isArray(input.items) || input.items.length === 0) return { error: "Your cart is empty." };
  const customerName = String(input.customerName ?? "").trim().slice(0, 100);
  const rawContact = String(input.contact ?? "").trim();
  if (!customerName) return { error: "Enter your name." };
  if (!rawContact) return { error: "Enter your email or phone number." };
  const isEmail = rawContact.includes("@");
  const contact = isEmail ? rawContact.toLowerCase().slice(0, 120) : rawContact.slice(0, 30);
  if (isEmail ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) : contact.replace(/\D/g, "").length < 6) {
    return { error: isEmail ? "That email doesn't look right." : "That phone number doesn't look right." };
  }

  const items = await buildItemsFromLiveMenu(restaurant.id, input.items, "Dine in");
  if (items.length === 0) return { error: "None of the items in your cart are available anymore." };

  const recentForTable = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.tableId, table.id), eq(orders.placedVia, "online"), gte(orders.createdAt, Date.now() - QR_ORDER_WINDOW_MS)));
  if (recentForTable.length >= QR_ORDER_LIMIT) {
    return { error: "This table has placed several orders just now — please ask a member of staff to add more." };
  }

  // Link an existing loyalty member with this contact (earning only — nothing is redeemed here),
  // but never create one from an unverified contact.
  const member = await findLoyaltyMemberByContact(restaurant.id, contact);

  const orderNumber = await insertPublicOrder({
    restaurantId: restaurant.id,
    placedVia: "online",
    createdByName: "Table QR",
    channel: "Dine in",
    tableId: table.id,
    tableNumber: table.number,
    guests: Math.max(1, Math.min(30, Math.floor(Number(input.guests) || 1))),
    items,
    customerName,
    // orders has no email column — the contact field holds whichever the customer gave.
    customerPhone: contact,
    loyaltyMemberId: member?.id ?? null,
  });
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
