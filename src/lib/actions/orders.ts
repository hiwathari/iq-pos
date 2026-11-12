"use server";

import { priceItemsWithPromotions } from "@/lib/data/promotions";
import { redeemStoreCredits } from "@/lib/data/store-credit";
import { releaseSerials, sellSerials, serialsOf } from "@/lib/data/serials";
import { onAccountAmount } from "@/lib/data/trade-accounts";
import { voidOrderCore } from "@/lib/void-order";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { ageChecks, orders, restaurants, serialNumbers, tables, tradeAccounts } from "@/db/schema";
import type { Order, OrderChannel, OrderItem, OrderStatus, PaymentLine, ThirdPartyProvider } from "@/lib/types";
import { itemsSubtotal, orderBreakdown, resolveCouponDiscount } from "@/lib/types";
import { getUserPermissions, requireRestaurantContext } from "@/lib/scope";
import { hasPermission } from "@/lib/permissions";
import { findActiveCoupon } from "@/lib/data/coupons";
import { findLoyaltyMemberById } from "@/lib/data/loyalty";
import { freeOrderTables, freeTableIfNoLiveOrders, isOrderLive, nextOrderNumber } from "@/lib/order-helpers";
import { businessProfile } from "@/lib/business-profile";
import { adjustStockForEdit, negativeStockMode, stockShortfalls, stockUsageForItems, takeStockForOrder } from "@/lib/stock";

// An order is "closed out" once it's both served and paid — matches the Till's own
// definition (see isOrderClosedOut in order-line-client.tsx). closedOutAt records the moment
// that first became true so the table can be auto-freed a minute after it happens.
function isClosedOut(status: OrderStatus, paymentMethod: string | null) {
  return status === "Served" && !!paymentMethod;
}

type RemovedItem = NonNullable<Order["removedItems"]>[number];

// Drops the edit-tracking fields a client might send — only diffEditedItems sets them.
function stripChangeFlags(item: OrderItem): OrderItem {
  const clean = { ...item };
  delete clean.changed;
  delete clean.prevQty;
  return clean;
}

// Works out what a Till edit changed on an already-placed order, for the Kitchen Display: new
// lines come back flagged "added", lines whose qty or note changed "updated" (with the qty before
// the change; a qty increase also un-ticks the line so the kitchen makes the extra), unchanged
// lines keep whatever flag an earlier edit gave them, and lines that are gone are added to
// removedItems. Once the kitchen has finished the ticket (Served/Ready) those earlier flags are
// spent, so an edit after that starts clean. Lines match by lineId; an older line saved without
// one (the Till backfills a fresh lineId when it loads it) matches by dish instead.
function diffEditedItems(
  existing: Order,
  nextItems: OrderItem[],
): { items: OrderItem[]; removedItems: RemovedItem[] | null } {
  const kitchenDone = existing.status === "Served" || existing.status === "Ready";
  const prevRemoved = kitchenDone ? null : existing.removedItems;
  const unmatched = existing.items.map((i) => (kitchenDone ? stripChangeFlags(i) : i));
  const takeMatch = (n: OrderItem) => {
    let idx = unmatched.findIndex((p) => !!p.lineId && p.lineId === n.lineId);
    if (idx < 0) idx = unmatched.findIndex((p) => !p.lineId && p.dishId === n.dishId && (p.note ?? "") === (n.note ?? ""));
    if (idx < 0) idx = unmatched.findIndex((p) => !p.lineId && p.dishId === n.dishId);
    return idx < 0 ? undefined : unmatched.splice(idx, 1)[0];
  };

  const items = nextItems.map((raw): OrderItem => {
    const n = stripChangeFlags(raw);
    const p = takeMatch(n);
    if (!p) return { ...n, changed: "added" };
    const sameQty = n.qty === p.qty;
    const sameNote = (n.note ?? "") === (p.note ?? "");
    if (sameQty && sameNote) return { ...n, changed: p.changed, prevQty: p.prevQty };
    if (p.changed === "added") return { ...n, changed: "added", ready: n.qty > p.qty ? false : n.ready };
    // Put back to the qty it had before an earlier edit, with the note untouched: nothing to flag.
    if (sameNote && p.prevQty !== undefined && n.qty === p.prevQty) return n;
    const prevQty = p.prevQty ?? p.qty;
    return { ...n, changed: "updated", prevQty: n.qty === prevQty ? undefined : prevQty, ready: n.qty > p.qty ? false : n.ready };
  });

  const addedBack = (r: RemovedItem) => items.some((i) => i.changed === "added" && i.dishId === r.dishId && (i.note ?? "") === (r.note ?? ""));
  const removed = [
    ...(prevRemoved ?? []),
    ...unmatched.map(({ dishId, name, price, qty, note, lineId }) => ({ dishId, name, price, qty, note, lineId })),
  ].filter((r) => !addedBack(r));
  return { items, removedItems: removed.length ? removed : null };
}

export interface PlaceOrderInput {
  editingOrderId: string | null;
  tableId: string | null;
  tableNumber: number | null;
  // Other tables pushed together for this one order (a big party) — only read when a NEW order is
  // placed; merging into an order that already exists is mergeTableIntoOrderAction.
  mergedTableIds?: string[];
  // A tip added at payment (money, on top of the order total).
  tip?: number;
  guests: number;
  channel: OrderChannel;
  thirdPartyProvider?: ThirdPartyProvider;
  items: OrderItem[];
  payments: PaymentLine[];
  cashReceived?: number;
  extraDiscount?: number;
  couponCode?: string;
  // The business customer this sale is for (step 6.6); "On account" payments need it.
  tradeAccountId?: string;
  loyaltyMemberId?: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
}

// Returns the placed/edited order's id — used by the Till to build the printed receipt's QR
// link right after placement (see order-line-client.tsx's handlePlaceOrder), since auto-print on
// payment needs an id to exist before the page's own data has refreshed to include it. undefined
// for every early-return path (no items, a deduped double-tap) where nothing was actually placed.
export type PlaceOrderResult = { id: string; orderNumber: string; stockWarnings?: string[] } | { error: string } | undefined;

export async function placeOrderAction(rawInput: PlaceOrderInput): Promise<PlaceOrderResult> {
  const { session, restaurantId } = await requireRestaurantContext();
  if (rawInput.items.length === 0) return;
  // Promotions (step 5.3) are priced here from the live promotions — whatever promo figures the
  // client sent are thrown away and recomputed, like coupons.
  const input: PlaceOrderInput = { ...rawInput, items: await priceItemsWithPromotions(restaurantId, rawInput.items, rawInput.channel) };

  // A tip is never negative, is rounded to the penny, and only exists once something has been paid; it is
  // part of what the customer paid (the payment lines include it), not of the sales total.
  const tip = input.payments.length === 0 ? 0 : Math.max(0, Math.min(100000, Math.round((Number(input.tip) || 0) * 100) / 100));
  const hasCustomerInfo = input.channel === "Take Away" || input.channel === "Delivery";
  const paymentMethod =
    input.payments.length === 0 ? null : input.payments.length === 1 ? input.payments[0].method : "Split";
  // A part paid with a store-credit slip keeps its payment line (with the slip's code) even when
  // it is the only one, so a void can give the balance back.
  // With a tip the lines are always kept: they carry the tip, so every report that reads the lines sees money taken.
  const payments = input.payments.length > 1 || tip > 0 || input.payments.some((p) => p.creditCode || p.method === "On account") ? input.payments : null;

  const existing = input.editingOrderId
    ? (
        await db
          .select()
          .from(orders)
          .where(and(eq(orders.id, input.editingOrderId), eq(orders.restaurantId, restaurantId)))
          .limit(1)
      )[0]
    : undefined;

  // Discounting is manager-only (see canDiscount in order-line/page.tsx, which hides the
  // controls for Staff) — enforced again here so a Staff session can't just craft a request.
  // A Staff edit to an order a manager already discounted keeps that discount as-is; it can
  // never introduce or change one, since a Staff session's own input value is never trusted.
  const permissions = session.role === "staff" ? await getUserPermissions(session.userId) : null;
  const canDiscount = hasPermission(session.role, permissions, "till-discount");
  const subtotal = itemsSubtotal(input.items);
  let extraDiscount: number;
  let couponCode: string | null;
  let couponDiscount: number;
  if (canDiscount) {
    // Never trust a client-supplied discount amount — recompute from the live coupon record
    // against this order's own item subtotal, so a stale or tampered value can't be saved.
    extraDiscount = Math.max(0, Math.min(subtotal, input.extraDiscount ?? 0));
    const trimmedCode = input.couponCode?.trim().toUpperCase() || null;
    couponCode = null;
    couponDiscount = 0;
    if (trimmedCode) {
      const coupon = await findActiveCoupon(restaurantId, trimmedCode);
      if (coupon) {
        couponCode = coupon.code;
        couponDiscount = resolveCouponDiscount(coupon, Math.max(0, subtotal - extraDiscount));
      }
    }
  } else {
    extraDiscount = existing?.extraDiscount ?? 0;
    couponCode = existing?.couponCode ?? null;
    couponDiscount = existing?.couponDiscount ?? 0;
  }

  // Confirm the loyalty member actually belongs to this restaurant before attaching it — the
  // Till only ever hands back an ID it just resolved itself, but never trust a client ID as-is.
  const loyaltyMember = input.loyaltyMemberId ? await findLoyaltyMemberById(restaurantId, input.loyaltyMemberId) : null;
  const loyaltyMemberId = loyaltyMember?.id ?? null;

  // Negative-stock setting (lib/stock.ts): how much more stock this sale takes than the order
  // already held — all of it for a new order, only the extra for an edit — checked against what's
  // left. "block" refuses the sale naming the items; "warn" sells and tells the Till.
  let stockWarnings: string[] | undefined;
  const stockMode = await negativeStockMode(restaurantId);
  if (stockMode !== "allow") {
    const takesStock = !existing || (existing.status !== "Pending" && existing.status !== "Voided");
    const after = await stockUsageForItems(restaurantId, input.items);
    const before = existing && takesStock ? await stockUsageForItems(restaurantId, existing.items) : new Map<string, number>();
    const extra = new Map([...after].map(([id, qty]) => [id, qty - (before.get(id) ?? 0)] as const));
    const short = takesStock ? await stockShortfalls(restaurantId, extra) : [];
    const lines = short.map((r) => `${r.name} (${formatStockQty(r.quantity)} ${r.unit} left)`);
    if (lines.length && stockMode === "block") return { error: `Not enough stock: ${lines.join(", ")}.` };
    if (lines.length) stockWarnings = lines;
  }

  // Store credit (step 5.5): take the balance now, before anything is saved, for slips this
  // order didn't already use (an edit re-sends the payments it already holds).
  const alreadyUsed = new Set((existing?.payments ?? []).map((p) => p.creditCode).filter(Boolean));
  const newCreditUses = input.payments.filter((p) => p.creditCode && !alreadyUsed.has(p.creditCode));
  if (newCreditUses.length) {
    const taken = await redeemStoreCredits(restaurantId, newCreditUses.map((p) => ({ code: p.creditCode!, amount: p.amount })));
    if (taken.error) return { error: taken.error };
  }

  // Trade account (step 6.6): a sale on account adds to what the customer owes, within their credit
  // limit and never while the account is on hold. An edit only adds / removes the difference.
  const onAccountNow = input.payments.filter((p) => p.method === "On account").reduce((s, p) => s + p.amount, 0);
  const onAccountBefore = existing ? onAccountAmount(existing) : 0;
  let tradeAccountId: string | null = existing?.tradeAccountId ?? null;
  if (input.tradeAccountId !== undefined) tradeAccountId = input.tradeAccountId || null;
  if (tradeAccountId) {
    const [acct] = await db.select().from(tradeAccounts).where(and(eq(tradeAccounts.id, tradeAccountId), eq(tradeAccounts.restaurantId, restaurantId))).limit(1);
    if (!acct) return { error: "That trade account no longer exists." };
    const delta = Math.round((onAccountNow - onAccountBefore) * 100) / 100;
    if (delta > 0) {
      if (acct.onHold) return { error: `${acct.companyName} is on hold — they can't buy on account.` };
      if (acct.creditLimit != null && acct.balance + delta > acct.creditLimit + 0.004) {
        return { error: `That would take ${acct.companyName} over their credit limit (${acct.creditLimit.toFixed(2)}; they owe ${acct.balance.toFixed(2)}).` };
      }
    }
    if (Math.abs(delta) > 0.004) await db.update(tradeAccounts).set({ balance: sql`round(${tradeAccounts.balance} + ${delta}, 2)` }).where(eq(tradeAccounts.id, acct.id));
  } else if (onAccountNow > 0.004) {
    return { error: "Choose the trade account for a sale on account." };
  }

  // Serial numbers (step 5.2): every serial on a line must be in stock for that product, except the
  // ones this order already holds (an edit re-sends them). Marked sold once the order has an id.
  const priorSerials = new Set(serialsOf(existing?.items ?? []));
  const wantedSerials = input.items.flatMap((i) => (i.serials ?? []).map((serial) => ({ serial, dishId: i.dishId, name: i.name }))).filter((s) => !priorSerials.has(s.serial));
  if (wantedSerials.length) {
    if (new Set(wantedSerials.map((s) => s.serial)).size !== wantedSerials.length) return { error: "The same serial number is on the sale twice." };
    const found = await db
      .select({ serial: serialNumbers.serial, status: serialNumbers.status, dishId: serialNumbers.dishId })
      .from(serialNumbers)
      .where(and(eq(serialNumbers.restaurantId, restaurantId), inArray(serialNumbers.serial, wantedSerials.map((s) => s.serial))));
    const byCode = new Map(found.map((f) => [f.serial, f]));
    for (const w of wantedSerials) {
      const f = byCode.get(w.serial);
      if (!f || f.dishId !== w.dishId) return { error: `Serial ${w.serial} isn't recorded for ${w.name}.` };
      if (f.status !== "in_stock") return { error: `Serial ${w.serial} (${w.name}) isn't available — it's ${f.status === "sold" ? "already sold" : f.status}.` };
    }
  }

  let newOrderId: string | undefined;
  let newOrderNumber: string | undefined;

  if (input.editingOrderId) {
    const { items: editedItems, removedItems } = existing
      ? diffEditedItems(existing, input.items)
      : { items: input.items.map(stripChangeFlags), removedItems: null };
    // The kitchen already finished this ticket (Served, or the legacy "Ready"), but the edit just
    // put an unprepped item back on it (e.g. another dish added at the table) — reopen it so it
    // reappears on the Kitchen Display as a running order instead of staying done with food
    // nobody's cooking.
    const reopensKitchen =
      (existing?.status === "Ready" || existing?.status === "Served") && editedItems.some((item) => !item.ready);
    // A parked sale in a shop (no kitchen) that's now paid in full is finished, like a new paid sale.
    const paidNow = input.payments.reduce((sum, p) => sum + p.amount, 0);
    const finishesNow =
      !!existing &&
      (existing.status === "In Kitchen" || existing.status === "Wait List") &&
      !!paymentMethod &&
      paidNow >= orderBreakdown({ items: editedItems, extraDiscount, couponDiscount }).total + tip - 0.01 &&
      !(await kitchenInUse(restaurantId));
    const statusAfter: OrderStatus | undefined = reopensKitchen ? "In Kitchen" : finishesNow ? "Served" : existing?.status;
    const closedOutAt =
      existing && statusAfter && isClosedOut(statusAfter, paymentMethod) ? (existing.closedOutAt ?? Date.now()) : null;

    await db
      .update(orders)
      .set({
        tableId: input.tableId,
        tableNumber: input.tableNumber,
        guests: input.guests,
        channel: input.channel,
        thirdPartyProvider: input.channel === "Third Party" ? input.thirdPartyProvider : null,
        items: editedItems,
        removedItems,
        paymentMethod,
        payments,
        cashReceived: input.cashReceived ?? null,
        extraDiscount,
        tip,
        couponCode,
        couponDiscount,
        tradeAccountId,
        loyaltyMemberId,
        customerName: hasCustomerInfo ? input.customerName || null : null,
        customerPhone: hasCustomerInfo ? input.customerPhone || null : null,
        customerAddress: input.channel === "Delivery" ? input.customerAddress || null : null,
        updatedAt: Date.now(),
        closedOutAt,
        ...(reopensKitchen ? { status: "In Kitchen" as OrderStatus, servedAt: null } : {}),
        ...(finishesNow ? { status: "Served" as OrderStatus, servedAt: Date.now(), recalledAt: null } : {}),
      })
      .where(and(eq(orders.id, input.editingOrderId), eq(orders.restaurantId, restaurantId)));
    // Stock follows the edit: only the difference is taken or given back. A Pending customer
    // order hasn't taken any stock yet, and a voided one has nothing left to adjust.
    if (existing && existing.status !== "Pending" && existing.status !== "Voided") {
      await adjustStockForEdit(restaurantId, existing.id, existing.items, editedItems, session.name);
    }
  } else {
    // Guard against double/triple-tapping "Place Order" (or a slow network making someone tap
    // again) creating duplicate orders — if the same staff member just placed an identical order
    // for the same table/channel in the last few seconds, treat this as a repeat of that click
    // rather than a new order.
    const dedupeCutoff = Date.now() - 8000;
    const recentOrders = await db
      .select({ tableId: orders.tableId, channel: orders.channel, items: orders.items })
      .from(orders)
      .where(
        and(
          eq(orders.restaurantId, restaurantId),
          eq(orders.createdByUserId, session.userId),
          gte(orders.createdAt, dedupeCutoff)
        )
      );
    const isDuplicate = recentOrders.some(
      (o) => o.tableId === input.tableId && o.channel === input.channel && JSON.stringify(o.items) === JSON.stringify(input.items)
    );
    if (isDuplicate) return;

    // Tables merged into this new order: they must exist and not already be held by a live order.
    let mergedTables: { id: string; number: number }[] = [];
    const mergeIds = [...new Set(input.mergedTableIds ?? [])].filter((id) => id && id !== input.tableId);
    if (input.tableId && mergeIds.length > 0) {
      mergedTables = await db
        .select({ id: tables.id, number: tables.number })
        .from(tables)
        .where(and(eq(tables.restaurantId, restaurantId), inArray(tables.id, mergeIds)));
      const liveOrders = (await db.select().from(orders).where(eq(orders.restaurantId, restaurantId))).filter(isOrderLive);
      const clash = mergedTables.find((t) => liveOrders.some((o) => o.tableId === t.id || o.mergedTableNumbers?.includes(t.number)));
      if (clash) return { error: `Table ${clash.number} already has an open order — pick another table to merge.` };
    }

    newOrderNumber = await nextOrderNumber(restaurantId);
    newOrderId = crypto.randomUUID();

    // Counter service (a cafe, a shop — anything whose business profile says so or that has the
    // kitchen switched off, see lib/business-profile.ts): a new order that's already paid in full
    // skips "In Kitchen" and is created straight as Served — the end state the normal flow reaches
    // via the kitchen. A part-paid or unpaid one stays open (a shop's "parked" sale).
    let status: OrderStatus = input.channel === "Wait List" ? "Wait List" : "In Kitchen";
    let servedAt: number | null = null;
    let closedOutAt: number | null = null;
    const paidTotal = input.payments.reduce((sum, p) => sum + p.amount, 0);
    const orderTotal = orderBreakdown({ items: input.items, extraDiscount, couponDiscount }).total + tip;
    if (status === "In Kitchen" && paymentMethod && paidTotal >= orderTotal - 0.01 && (await finishesWhenPaid(restaurantId))) {
      status = "Served";
      servedAt = Date.now();
      closedOutAt = servedAt;
    }

    await db.insert(orders).values({
      id: newOrderId,
      restaurantId,
      orderNumber: newOrderNumber,
      tableId: input.tableId,
      tableNumber: input.tableNumber,
      mergedTableNumbers: mergedTables.length ? mergedTables.map((t) => t.number) : null,
      guests: input.guests,
      channel: input.channel,
      thirdPartyProvider: input.channel === "Third Party" ? input.thirdPartyProvider : null,
      status,
      servedAt,
      closedOutAt,
      items: input.items.map(stripChangeFlags),
      paymentMethod,
      payments,
      cashReceived: input.cashReceived ?? null,
      extraDiscount,
      tip,
      couponCode,
      couponDiscount,
      tradeAccountId,
      loyaltyMemberId,
      customerName: hasCustomerInfo ? input.customerName || null : null,
      customerPhone: hasCustomerInfo ? input.customerPhone || null : null,
      customerAddress: input.channel === "Delivery" ? input.customerAddress || null : null,
      createdByUserId: session.userId,
      createdByName: session.name,
      createdLabel: "Just now",
    });

    if (input.tableId) {
      await db
        .update(tables)
        .set({ status: "on-dine", seated: input.guests, seatedAt: Date.now() })
        .where(and(eq(tables.id, input.tableId), eq(tables.restaurantId, restaurantId)));
    }
    if (mergedTables.length > 0) {
      await db
        .update(tables)
        .set({ status: "on-dine", seatedAt: Date.now() })
        .where(and(eq(tables.restaurantId, restaurantId), inArray(tables.id, mergedTables.map((t) => t.id))));
    }

    await takeStockForOrder(restaurantId, newOrderId, input.items, session.name);
  }

  // Serials: sold against this order; any the edit dropped go back on the shelf.
  {
    const orderIdNow = input.editingOrderId ?? newOrderId!;
    const nowSet = new Set(serialsOf(input.items));
    const dropped = [...priorSerials].filter((s) => !nowSet.has(s));
    if (dropped.length) await releaseSerials(restaurantId, dropped);
    if (wantedSerials.length) await sellSerials(restaurantId, orderIdNow, input.items, priorSerials);
  }

  // Challenge 25 log: an age-restricted line the Till approved, recorded once against the order.
  const priorLines = new Set((existing?.items ?? []).filter((i) => i.ageCheck).map((i) => i.lineId ?? i.dishId));
  const approved = input.items.filter((i) => i.ageCheck && !priorLines.has(i.lineId ?? i.dishId));
  if (approved.length) {
    await db.insert(ageChecks).values(
      approved.map((i) => ({
        restaurantId,
        orderId: input.editingOrderId ?? newOrderId!,
        dishId: i.dishId,
        productName: i.name,
        minAge: i.ageCheck!.minAge,
        result: "approved" as const,
        method: i.ageCheck!.method,
        staffName: session.name,
      }))
    );
  }

  revalidatePath("/order-line");
  revalidatePath("/manage-table");
  revalidatePath("/dashboard");
  revalidatePath("/kitchen");

  return {
    id: input.editingOrderId ?? newOrderId!,
    orderNumber: input.editingOrderId ? (existing?.orderNumber ?? "") : newOrderNumber!,
    stockWarnings,
  };
}

// A paid new sale is finished at once for counter service (cafe, shops) or when the kitchen is
// switched off; kitchenInUse is the narrower check for finishing a parked sale paid later (a cafe
// with a kitchen still serves it through the kitchen).
async function finishesWhenPaid(restaurantId: string) {
  const [r] = await db.select({ type: restaurants.businessType, features: restaurants.features }).from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1);
  const profile = businessProfile(r?.type, r?.features);
  return profile.counterService || !profile.features.kitchenDisplay;
}

async function kitchenInUse(restaurantId: string) {
  const [r] = await db.select({ type: restaurants.businessType, features: restaurants.features }).from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1);
  return businessProfile(r?.type, r?.features).features.kitchenDisplay;
}

function formatStockQty(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, "");
}

// itemKey is item.lineId when the item has one, else its dishId — matches whichever identity
// the caller has. Older orders placed before lineId existed only ever had one line per dish, so
// falling back to dishId there still targets the right (and only) item.
export async function toggleOrderItemReadyAction(orderId: string, itemKey: string, ready: boolean) {
  const { restaurantId } = await requireRestaurantContext();
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)))
    .limit(1);
  if (!order) return;

  const items = order.items.map((i) => ((i.lineId ?? i.dishId) === itemKey ? { ...i, ready } : i));
  // Ticking off the last item auto-advances the order straight to Served — there's no separate
  // "Ready, waiting to be marked served" step; ready IS served, one less tap for the kitchen.
  const allReady = items.every((i) => i.ready);
  const advanceToServed = allReady && order.status === "In Kitchen";
  await db
    .update(orders)
    .set({ items, status: advanceToServed ? "Served" : order.status, servedAt: advanceToServed ? Date.now() : order.servedAt })
    .where(eq(orders.id, orderId));
  revalidatePath("/kitchen");
  revalidatePath("/order-line");
}

// One-tap shortcut for a ticket the kitchen doesn't need to track item-by-item — ticks every
// item ready and takes the order straight to Served in a single write, from either Wait List or
// In Kitchen, instead of requiring each item tapped individually first.
export async function completeOrderAction(orderId: string) {
  const { restaurantId } = await requireRestaurantContext();
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)))
    .limit(1);
  if (!order) return;

  const items = order.items.map((i) => ({ ...i, ready: true }));
  await db.update(orders).set({ items, status: "Served", servedAt: Date.now(), recalledAt: null }).where(eq(orders.id, orderId));
  revalidatePath("/kitchen");
  revalidatePath("/order-line");
}

// Kitchen Display → Completed list → Recall: takes a finished ticket back to "In Kitchen" (a
// mistaken Complete, or a dish sent back) so it shows on the Pending board again. Every item is
// un-ticked, so the cook works through it once more. Voided orders can't be recalled.
export async function recallOrderAction(orderId: string) {
  const { restaurantId } = await requireRestaurantContext();
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)))
    .limit(1);
  if (!order || (order.status !== "Served" && order.status !== "Ready")) return;
  const items = order.items.map((i) => ({ ...i, ready: false }));
  await db
    .update(orders)
    .set({ items, status: "In Kitchen", servedAt: null, closedOutAt: null, recalledAt: Date.now() })
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)));
  revalidatePath("/kitchen");
  revalidatePath("/order-line");
  revalidatePath("/manage-table");
  revalidatePath("/dashboard");
}

export async function setOrderStatusAction(orderId: string, status: OrderStatus) {
  const { restaurantId } = await requireRestaurantContext();
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)))
    .limit(1);
  const closedOutAt = order
    ? isClosedOut(status, order.paymentMethod)
      ? (order.closedOutAt ?? Date.now())
      : null
    : null;

  await db
    .update(orders)
    .set({ status, servedAt: status === "Served" ? Date.now() : undefined, closedOutAt, ...(status === "Served" || status === "Voided" ? { recalledAt: null } : {}) })
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)));
  revalidatePath("/order-line");
  revalidatePath("/manage-table");
  revalidatePath("/dashboard");
  revalidatePath("/kitchen");
}

export async function voidOrderAction(orderId: string, reason: string) {
  const { session, restaurantId } = await requireRestaurantContext();
  await voidOrderCore(restaurantId, orderId, reason, session.name);
  revalidatePath("/order-line");
  revalidatePath("/manage-table");
  revalidatePath("/dashboard");
  revalidatePath("/kitchen");
  revalidatePath("/reports");
}

// Customer-placed orders (website, table QR, kiosk) arrive as "Pending" and only reach the
// kitchen once someone on the Till accepts them — stock is taken at that point, not before.
// The status check is part of the update itself, so two tills tapping Accept at the same moment
// can't both send it through (or both take the stock).
export async function acceptOnlineOrderAction(orderId: string): Promise<{ error?: string }> {
  const { session, restaurantId } = await requireRestaurantContext();
  const accepted = await db
    .update(orders)
    .set({ status: "In Kitchen" })
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId), eq(orders.status, "Pending")))
    .returning({ items: orders.items });
  if (accepted.length === 0) return { error: "Someone already handled this order." };
  await takeStockForOrder(restaurantId, orderId, accepted[0].items, session.name);
  revalidatePath("/order-line");
  revalidatePath("/manage-table");
  revalidatePath("/dashboard");
  revalidatePath("/kitchen");
  return {};
}

export async function rejectOnlineOrderAction(orderId: string): Promise<{ error?: string }> {
  const { restaurantId } = await requireRestaurantContext();
  const rejected = await db
    .update(orders)
    .set({ status: "Voided", voidReason: "Online order not accepted", voidedAt: Date.now() })
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId), eq(orders.status, "Pending")))
    .returning({ tableId: orders.tableId, mergedTableNumbers: orders.mergedTableNumbers });
  if (rejected.length === 0) return { error: "Someone already handled this order." };
  await freeOrderTables(restaurantId, rejected[0], orderId);
  revalidatePath("/order-line");
  revalidatePath("/manage-table");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  return {};
}

export interface TableActionState {
  error?: string;
  order?: Order;
}

// Relocates an order to a different table entirely — e.g. the party asked to move seats.
// The old table is freed and the new one taken, so exactly one table is occupied throughout.
export async function swapOrderTableAction(orderId: string, newTableId: string): Promise<TableActionState> {
  const { restaurantId } = await requireRestaurantContext();
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)))
    .limit(1);
  if (!order) return { error: "Order not found." };

  const [newTable] = await db
    .select()
    .from(tables)
    .where(and(eq(tables.id, newTableId), eq(tables.restaurantId, restaurantId)))
    .limit(1);
  if (!newTable) return { error: "Table not found." };
  if (newTable.id === order.tableId) return { error: "The order is already on that table." };

  const clashing = await db.select().from(orders).where(and(eq(orders.restaurantId, restaurantId), eq(orders.tableId, newTable.id)));
  if (clashing.some(isOrderLive)) {
    return { error: `Table ${newTable.number} already has an active order — use Merge instead.` };
  }

  const oldTableId = order.tableId;

  const [updated] = await db
    .update(orders)
    .set({ tableId: newTable.id, tableNumber: newTable.number, updatedAt: Date.now() })
    .where(eq(orders.id, orderId))
    .returning();
  await db
    .update(tables)
    .set({ status: "on-dine", seated: order.guests, seatedAt: Date.now() })
    .where(and(eq(tables.id, newTable.id), eq(tables.restaurantId, restaurantId)));
  if (oldTableId) {
    await db
      .update(tables)
      .set({ status: "available", seated: 0, seatedAt: null })
      .where(and(eq(tables.id, oldTableId), eq(tables.restaurantId, restaurantId)));
  }

  revalidatePath("/order-line");
  revalidatePath("/manage-table");
  revalidatePath("/dashboard");
  revalidatePath("/kitchen");
  return { order: updated };
}

// Folds another table (and its active order, if it has one) into this order, for a party
// spanning two physical tables billed as one ticket — shown as "Table 03 + 04". The merged
// table's own order is voided (not deleted) with a note pointing at the surviving order.
export async function mergeTableIntoOrderAction(primaryOrderId: string, secondaryTableId: string): Promise<TableActionState> {
  const { restaurantId } = await requireRestaurantContext();
  const [primary] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, primaryOrderId), eq(orders.restaurantId, restaurantId)))
    .limit(1);
  if (!primary) return { error: "Order not found." };

  const [secondaryTable] = await db
    .select()
    .from(tables)
    .where(and(eq(tables.id, secondaryTableId), eq(tables.restaurantId, restaurantId)))
    .limit(1);
  if (!secondaryTable) return { error: "Table not found." };
  if (secondaryTable.id === primary.tableId || primary.mergedTableNumbers?.includes(secondaryTable.number)) {
    return { error: "That table is already part of this order." };
  }

  const tableOrders = await db.select().from(orders).where(and(eq(orders.restaurantId, restaurantId), eq(orders.tableId, secondaryTable.id)));
  const secondaryOrder = tableOrders.find(isOrderLive);

  let items = primary.items;
  let guests = primary.guests;
  if (secondaryOrder) {
    const merged = primary.items.map((i) => ({ ...i }));
    for (const item of secondaryOrder.items) {
      const match = merged.find((i) => i.dishId === item.dishId && i.note === item.note);
      if (match) match.qty += item.qty;
      else merged.push(item);
    }
    items = merged;
    guests = primary.guests + secondaryOrder.guests;

    await db
      .update(orders)
      .set({
        status: "Voided",
        voidReason: `Merged into Table ${primary.tableNumber ?? primary.orderNumber}`,
        voidedAt: Date.now(),
      })
      .where(eq(orders.id, secondaryOrder.id));
  }

  const mergedTableNumbers = [...(primary.mergedTableNumbers ?? []), secondaryTable.number];

  const [updated] = await db
    .update(orders)
    .set({ items, guests, mergedTableNumbers, updatedAt: Date.now() })
    .where(eq(orders.id, primaryOrderId))
    .returning();
  await db
    .update(tables)
    .set({ status: "on-dine", seatedAt: Date.now() })
    .where(and(eq(tables.id, secondaryTable.id), eq(tables.restaurantId, restaurantId)));

  revalidatePath("/order-line");
  revalidatePath("/manage-table");
  revalidatePath("/dashboard");
  revalidatePath("/kitchen");
  return { order: updated };
}
