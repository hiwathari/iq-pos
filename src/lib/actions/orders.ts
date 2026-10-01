"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { orders, restaurants, tables } from "@/db/schema";
import type { Order, OrderChannel, OrderItem, OrderStatus, PaymentLine, ThirdPartyProvider } from "@/lib/types";
import { resolveCouponDiscount } from "@/lib/types";
import { getUserPermissions, requireRestaurantContext } from "@/lib/scope";
import { hasPermission } from "@/lib/permissions";
import { findActiveCoupon } from "@/lib/data/coupons";
import { findLoyaltyMemberById } from "@/lib/data/loyalty";
import { decrementInventoryForOrder, freeTableIfNoLiveOrders, isOrderLive, nextOrderNumber } from "@/lib/order-helpers";

// An order is "closed out" once it's both served and paid — matches the Till's own
// definition (see isOrderClosedOut in order-line-client.tsx). closedOutAt records the moment
// that first became true so the table can be auto-freed a minute after it happens.
function isClosedOut(status: OrderStatus, paymentMethod: string | null) {
  return status === "Served" && !!paymentMethod;
}

export interface PlaceOrderInput {
  editingOrderId: string | null;
  tableId: string | null;
  tableNumber: number | null;
  guests: number;
  channel: OrderChannel;
  thirdPartyProvider?: ThirdPartyProvider;
  items: OrderItem[];
  payments: PaymentLine[];
  cashReceived?: number;
  extraDiscount?: number;
  couponCode?: string;
  loyaltyMemberId?: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
}

export async function placeOrderAction(input: PlaceOrderInput) {
  const { session, restaurantId } = await requireRestaurantContext();
  if (input.items.length === 0) return;

  const hasCustomerInfo = input.channel === "Take Away" || input.channel === "Delivery";
  const paymentMethod =
    input.payments.length === 0 ? null : input.payments.length === 1 ? input.payments[0].method : "Split";
  const payments = input.payments.length > 1 ? input.payments : null;

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
  const subtotal = input.items.reduce((sum, i) => sum + i.price * i.qty, 0);
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

  if (input.editingOrderId) {
    const closedOutAt = existing
      ? isClosedOut(existing.status, paymentMethod)
        ? (existing.closedOutAt ?? Date.now())
        : null
      : null;
    // The kitchen already finished this ticket, but the edit just put an unprepped item back on
    // it (e.g. another dish added at the table) — reopen it so it reappears on the Kitchen
    // Display as a running order instead of staying "Ready" with food nobody's cooking.
    const reopensKitchen = existing?.status === "Ready" && input.items.some((item) => !item.ready);

    await db
      .update(orders)
      .set({
        tableId: input.tableId,
        tableNumber: input.tableNumber,
        guests: input.guests,
        channel: input.channel,
        thirdPartyProvider: input.channel === "Third Party" ? input.thirdPartyProvider : null,
        items: input.items,
        paymentMethod,
        payments,
        cashReceived: input.cashReceived ?? null,
        extraDiscount,
        couponCode,
        couponDiscount,
        loyaltyMemberId,
        customerName: hasCustomerInfo ? input.customerName || null : null,
        customerPhone: hasCustomerInfo ? input.customerPhone || null : null,
        customerAddress: input.channel === "Delivery" ? input.customerAddress || null : null,
        updatedAt: Date.now(),
        closedOutAt,
        ...(reopensKitchen ? { status: "In Kitchen" as OrderStatus } : {}),
      })
      .where(and(eq(orders.id, input.editingOrderId), eq(orders.restaurantId, restaurantId)));
  } else {
    const orderNumber = await nextOrderNumber(restaurantId);

    // Counter-service places with no kitchen ticket step (see directServeMode on restaurants)
    // skip "In Kitchen"/"Ready" for a new order that's already paid in full — it's created
    // straight as Served, the same end state the normal flow reaches via the kitchen board.
    let status: OrderStatus = input.channel === "Wait List" ? "Wait List" : "In Kitchen";
    let servedAt: number | null = null;
    let closedOutAt: number | null = null;
    if (status === "In Kitchen" && paymentMethod) {
      const [restaurant] = await db.select({ directServeMode: restaurants.directServeMode }).from(restaurants).where(eq(restaurants.id, restaurantId));
      if (restaurant?.directServeMode) {
        status = "Served";
        servedAt = Date.now();
        closedOutAt = Date.now();
      }
    }

    await db.insert(orders).values({
      id: crypto.randomUUID(),
      restaurantId,
      orderNumber,
      tableId: input.tableId,
      tableNumber: input.tableNumber,
      guests: input.guests,
      channel: input.channel,
      thirdPartyProvider: input.channel === "Third Party" ? input.thirdPartyProvider : null,
      status,
      servedAt,
      closedOutAt,
      items: input.items,
      paymentMethod,
      payments,
      cashReceived: input.cashReceived ?? null,
      extraDiscount,
      couponCode,
      couponDiscount,
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

    await decrementInventoryForOrder(restaurantId, input.items);
  }

  revalidatePath("/order-line");
  revalidatePath("/manage-table");
  revalidatePath("/dashboard");
  revalidatePath("/kitchen");
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
  // Ticking off the last item auto-advances the order to Ready — one less tap for the kitchen.
  const allReady = items.every((i) => i.ready);
  const advanceToReady = allReady && order.status === "In Kitchen";
  await db
    .update(orders)
    .set({ items, status: advanceToReady ? "Ready" : order.status })
    .where(eq(orders.id, orderId));
  revalidatePath("/kitchen");
  revalidatePath("/order-line");
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
    .set({ status, servedAt: status === "Served" ? Date.now() : undefined, closedOutAt })
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)));
  revalidatePath("/order-line");
  revalidatePath("/manage-table");
  revalidatePath("/dashboard");
  revalidatePath("/kitchen");
}

export async function voidOrderAction(orderId: string, reason: string) {
  const { restaurantId } = await requireRestaurantContext();
  const [order] = await db
    .select({ tableId: orders.tableId })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)))
    .limit(1);
  await db
    .update(orders)
    .set({ status: "Voided", voidReason: reason || "No reason given", voidedAt: Date.now() })
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)));
  // A voided order no longer occupies its table — free it up the same moment, rather than
  // leaving it stuck "on-dine" until something else happens to notice.
  if (order?.tableId) await freeTableIfNoLiveOrders(restaurantId, order.tableId, orderId);
  revalidatePath("/order-line");
  revalidatePath("/manage-table");
  revalidatePath("/dashboard");
  revalidatePath("/kitchen");
  revalidatePath("/reports");
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
