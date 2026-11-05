"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { orders } from "@/db/schema";
import { assertPermission, requireRestaurantContext } from "@/lib/scope";

// Picking, packing and dispatch (docs/retail-plan steps 6.3–6.4). A line's `ready` flag means
// "picked"; `short` means the picker couldn't find all of it. pick_status moves
// picking → packed → dispatched.

async function ownOrder(restaurantId: string, orderId: string) {
  const [o] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId))).limit(1);
  return o ?? null;
}

export async function setPickedAction(orderId: string, lineId: string, state: "picked" | "short" | "none"): Promise<{ error?: string }> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "picking");
  const o = await ownOrder(restaurantId, orderId);
  if (!o) return { error: "That order no longer exists." };
  if (o.pickStatus === "dispatched") return { error: "That order has been sent." };
  const items = o.items.map((i) => ((i.lineId ?? i.dishId) === lineId ? { ...i, ready: state === "picked", short: state === "short" || undefined } : i));
  await db.update(orders).set({ items, pickStatus: o.pickStatus === "packed" ? "picking" : "picking", updatedAt: Date.now() }).where(eq(orders.id, orderId));
  revalidatePath("/picking");
  return {};
}

export async function setPackedAction(orderId: string): Promise<{ error?: string }> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "picking");
  const o = await ownOrder(restaurantId, orderId);
  if (!o) return { error: "That order no longer exists." };
  if (o.items.some((i) => !i.ready && !i.short)) return { error: "Pick (or mark short) every line first." };
  await db.update(orders).set({ pickStatus: "packed", updatedAt: Date.now() }).where(eq(orders.id, orderId));
  revalidatePath("/picking");
  return {};
}

export async function dispatchOrderAction(orderId: string, input: { carrier?: string; tracking?: string }): Promise<{ error?: string }> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "picking");
  const o = await ownOrder(restaurantId, orderId);
  if (!o) return { error: "That order no longer exists." };
  if (o.pickStatus !== "packed") return { error: "Pack the order first." };
  await db
    .update(orders)
    .set({ pickStatus: "dispatched", dispatchedAt: Date.now(), carrier: String(input.carrier ?? "").trim().slice(0, 60) || null, tracking: String(input.tracking ?? "").trim().slice(0, 80) || null, updatedAt: Date.now() })
    .where(eq(orders.id, orderId));
  revalidatePath("/picking");
  return {};
}
