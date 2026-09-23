"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { orderCounters, orders, tables } from "@/db/schema";
import type { OrderChannel, OrderItem, OrderStatus, PaymentLine, ThirdPartyProvider } from "@/lib/types";
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
  await db.update(orders).set({ items }).where(eq(orders.id, orderId));
  revalidatePath("/kitchen");
  revalidatePath("/order-line");
}

export async function setOrderStatusAction(orderId: string, status: OrderStatus) {
  const { restaurantId } = await requireRestaurantContext();
  await db
    .update(orders)
    .set({ status })
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
