"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { orderCounters, orders, tables } from "@/db/schema";
import type { Order, OrderChannel, OrderItem, OrderStatus, PaymentLine, ThirdPartyProvider } from "@/lib/types";
import { requireRestaurantContext } from "@/lib/scope";

// 5-character order codes, base36-encoded from a per-restaurant counter. Deliberately not a
// plain incrementing decimal (so it doesn't read as "order #31 of the day"), but zero-padded
// base36 preserves numeric ordering character-by-character ('0'-'9' < 'A'-'Z' in ASCII too),
// so sorting the codes as strings reproduces the order they were placed in.
function encodeOrderNumber(counter: number) {
  return counter.toString(36).toUpperCase().padStart(5, "0");
}

async function nextOrderNumber(restaurantId: string) {
  const [existing] = await db.select().from(orderCounters).where(eq(orderCounters.restaurantId, restaurantId)).limit(1);
  const next = (existing?.value ?? 30) + 1;
  if (existing) {
    await db.update(orderCounters).set({ value: next }).where(eq(orderCounters.restaurantId, restaurantId));
  } else {
    await db.insert(orderCounters).values({ restaurantId, value: next });
  }
  return encodeOrderNumber(next);
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
  donation: number;
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

  if (input.editingOrderId) {
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
        donation: input.donation,
        customerName: hasCustomerInfo ? input.customerName || null : null,
        customerPhone: hasCustomerInfo ? input.customerPhone || null : null,
        customerAddress: input.channel === "Delivery" ? input.customerAddress || null : null,
        updatedAt: Date.now(),
      })
      .where(and(eq(orders.id, input.editingOrderId), eq(orders.restaurantId, restaurantId)));
  } else {
    const orderNumber = await nextOrderNumber(restaurantId);
    await db.insert(orders).values({
      id: crypto.randomUUID(),
      restaurantId,
      orderNumber,
      tableId: input.tableId,
      tableNumber: input.tableNumber,
      guests: input.guests,
      channel: input.channel,
      thirdPartyProvider: input.channel === "Third Party" ? input.thirdPartyProvider : null,
      status: input.channel === "Wait List" ? "Wait List" : "In Kitchen",
      items: input.items,
      paymentMethod,
      payments,
      cashReceived: input.cashReceived ?? null,
      donation: input.donation,
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
        .set({ status: "on-dine", seated: input.guests })
        .where(and(eq(tables.id, input.tableId), eq(tables.restaurantId, restaurantId)));
    }
  }

  revalidatePath("/order-line");
  revalidatePath("/manage-table");
  revalidatePath("/dashboard");
  revalidatePath("/kitchen");
}

export async function toggleOrderItemReadyAction(orderId: string, dishId: string, ready: boolean) {
  const { restaurantId } = await requireRestaurantContext();
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)))
    .limit(1);
  if (!order) return;

  const items = order.items.map((i) => (i.dishId === dishId ? { ...i, ready } : i));
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
  await db
    .update(orders)
    .set({ status, servedAt: status === "Served" ? Date.now() : undefined })
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)));
  revalidatePath("/order-line");
  revalidatePath("/dashboard");
  revalidatePath("/kitchen");
}

export async function voidOrderAction(orderId: string, reason: string) {
  const { restaurantId } = await requireRestaurantContext();
  await db
    .update(orders)
    .set({ status: "Voided", voidReason: reason || "No reason given" })
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)));
  revalidatePath("/order-line");
  revalidatePath("/dashboard");
  revalidatePath("/kitchen");
  revalidatePath("/reports");
}

export interface TableActionState {
  error?: string;
  order?: Order;
}

// An order is "live" on its table for merge/swap purposes once it isn't voided or fully
// wrapped up (served + paid) — matches the Till's own definition of an active ticket.
function isOrderLive(o: { status: OrderStatus; paymentMethod: string | null }) {
  if (o.status === "Voided") return false;
  if (o.status === "Served" && o.paymentMethod) return false;
  return true;
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
    .set({ status: "on-dine", seated: order.guests })
    .where(and(eq(tables.id, newTable.id), eq(tables.restaurantId, restaurantId)));
  if (oldTableId) {
    await db
      .update(tables)
      .set({ status: "available", seated: 0 })
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
      .set({ status: "Voided", voidReason: `Merged into Table ${primary.tableNumber ?? primary.orderNumber}` })
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
    .set({ status: "on-dine" })
    .where(and(eq(tables.id, secondaryTable.id), eq(tables.restaurantId, restaurantId)));

  revalidatePath("/order-line");
  revalidatePath("/manage-table");
  revalidatePath("/dashboard");
  revalidatePath("/kitchen");
  return { order: updated };
}
