"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { orderCounters, orders, tables } from "@/db/schema";
import type { OrderChannel, OrderItem, OrderStatus, ThirdPartyProvider } from "@/lib/types";
import { requireRestaurantContext } from "@/lib/scope";

async function nextOrderNumber(restaurantId: string) {
  const [existing] = await db.select().from(orderCounters).where(eq(orderCounters.restaurantId, restaurantId)).limit(1);
  const next = (existing?.value ?? 30) + 1;
  if (existing) {
    await db.update(orderCounters).set({ value: next }).where(eq(orderCounters.restaurantId, restaurantId));
  } else {
    await db.insert(orderCounters).values({ restaurantId, value: next });
  }
  return `F${String(next).padStart(4, "0")}`;
}

export interface PlaceOrderInput {
  editingOrderId: string | null;
  tableId: string | null;
  tableNumber: number | null;
  guests: number;
  channel: OrderChannel;
  thirdPartyProvider?: ThirdPartyProvider;
  items: OrderItem[];
  paymentMethod?: string;
  donation: number;
}

export async function placeOrderAction(input: PlaceOrderInput) {
  const { restaurantId } = await requireRestaurantContext();
  if (input.items.length === 0) return;

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
        paymentMethod: input.paymentMethod,
        donation: input.donation,
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
      paymentMethod: input.paymentMethod,
      donation: input.donation,
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
