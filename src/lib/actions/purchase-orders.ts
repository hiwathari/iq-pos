"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { dishes, inventoryItems, purchaseOrderLines, purchaseOrders, suppliers } from "@/db/schema";
import { assertPermission, requireRestaurantContext } from "@/lib/scope";
import { getRestaurant } from "@/lib/data/restaurants";
import { getPurchaseOrder } from "@/lib/data/purchase-orders";
import { sendPurchaseOrderEmail } from "@/lib/email";
import { roundMoney } from "@/lib/types";

// Purchase orders (docs/retail-plan step 4.5): draft → sent → part received → received.
// Receiving goes through Goods in (receiveStockAction), which ticks the lines off.

export interface PurchaseOrderInput {
  supplierId: string;
  expectedAt?: number | null;
  notes?: string;
  lines: { inventoryItemId: string; qty: number; unitCost?: number | null }[];
}

export interface PurchaseOrderResult {
  error?: string;
  id?: string;
  emailed?: boolean;
  notice?: string;
}

async function nextNumber(restaurantId: string) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(purchaseOrders).where(eq(purchaseOrders.restaurantId, restaurantId));
  return `PO${String(Number(n) + 1).padStart(4, "0")}`;
}

async function buildLines(restaurantId: string, input: PurchaseOrderInput) {
  const wanted = (Array.isArray(input.lines) ? input.lines : []).filter((l) => l && Number(l.qty) > 0);
  const ids = [...new Set(wanted.map((l) => l.inventoryItemId))];
  const items = ids.length
    ? await db.select().from(inventoryItems).where(and(eq(inventoryItems.restaurantId, restaurantId), inArray(inventoryItems.id, ids)))
    : [];
  const codes = new Map<string, string | null>();
  const dishIds = items.map((i) => i.dishId).filter((d): d is string => !!d);
  if (dishIds.length) {
    for (const d of await db.select({ id: dishes.id, code: dishes.supplierCode }).from(dishes).where(inArray(dishes.id, dishIds))) codes.set(d.id, d.code);
  }
  const byId = new Map(items.map((i) => [i.id, i]));
  const out: { inventoryItemId: string; name: string; unit: string; supplierCode: string | null; qtyOrdered: number; unitCost: number | null }[] = [];
  for (const l of wanted) {
    const item = byId.get(l.inventoryItemId);
    if (!item) return { error: "One of those items no longer exists." } as const;
    const existing = out.find((o) => o.inventoryItemId === item.id);
    const qty = Math.round(Number(l.qty) * 1000) / 1000;
    if (existing) {
      existing.qtyOrdered = Math.round((existing.qtyOrdered + qty) * 1000) / 1000;
      continue;
    }
    const cost = l.unitCost === null || l.unitCost === undefined || (l.unitCost as unknown) === "" ? item.costPrice : Number(l.unitCost);
    out.push({
      inventoryItemId: item.id,
      name: item.name,
      unit: item.unit,
      supplierCode: item.dishId ? (codes.get(item.dishId) ?? null) : null,
      qtyOrdered: qty,
      unitCost: cost != null && Number.isFinite(cost) && cost >= 0 ? cost : null,
    });
  }
  if (out.length === 0) return { error: "Add at least one item." } as const;
  return { lines: out } as const;
}

const totalOf = (lines: { qtyOrdered: number; unitCost: number | null }[]) => roundMoney(lines.reduce((s, l) => s + l.qtyOrdered * (l.unitCost ?? 0), 0));

export async function savePurchaseOrderAction(poId: string | null, input: PurchaseOrderInput): Promise<PurchaseOrderResult> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "purchase-orders");
  const [sup] = await db.select({ id: suppliers.id }).from(suppliers).where(and(eq(suppliers.id, input.supplierId), eq(suppliers.restaurantId, restaurantId))).limit(1);
  if (!sup) return { error: "Choose a supplier." };
  const built = await buildLines(restaurantId, input);
  if ("error" in built) return { error: built.error };
  const expectedAt = input.expectedAt && Number.isFinite(Number(input.expectedAt)) ? Number(input.expectedAt) : null;
  const notes = String(input.notes ?? "").trim().slice(0, 500) || null;

  let id = poId;
  if (poId) {
    const existing = await getPurchaseOrder(restaurantId, poId);
    if (!existing) return { error: "That purchase order no longer exists." };
    if (existing.status !== "draft") return { error: "Only a draft can be edited." };
    await db.update(purchaseOrders).set({ supplierId: sup.id, expectedAt, notes, total: totalOf(built.lines) }).where(eq(purchaseOrders.id, poId));
    await db.delete(purchaseOrderLines).where(eq(purchaseOrderLines.purchaseOrderId, poId));
  } else {
    const [row] = await db
      .insert(purchaseOrders)
      .values({ restaurantId, supplierId: sup.id, number: await nextNumber(restaurantId), expectedAt, notes, total: totalOf(built.lines), createdByName: session.name })
      .returning({ id: purchaseOrders.id });
    id = row.id;
  }
  await db.insert(purchaseOrderLines).values(built.lines.map((l) => ({ purchaseOrderId: id!, ...l })));
  revalidatePath("/purchase-orders");
  revalidatePath("/suppliers");
  return { id: id! };
}

// Send: email the order to the supplier (when asked and they have an address), or just mark it
// sent when it was ordered another way (phone, rep, their web shop).
export async function sendPurchaseOrderAction(poId: string, byEmail: boolean): Promise<PurchaseOrderResult> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "purchase-orders");
  const po = await getPurchaseOrder(restaurantId, poId);
  if (!po) return { error: "That purchase order no longer exists." };
  if (po.status !== "draft") return { error: `${po.number} has already been sent.` };
  const [sup] = await db.select().from(suppliers).where(eq(suppliers.id, po.supplierId)).limit(1);
  let emailed = false;
  if (byEmail) {
    if (!sup?.email) return { error: "This supplier has no email address — add one on the Suppliers screen, or mark the order as sent." };
    const restaurant = await getRestaurant(restaurantId);
    emailed = await sendPurchaseOrderEmail({
      to: sup.email,
      businessName: restaurant?.name ?? "Our shop",
      number: po.number,
      supplierName: sup.name,
      expected: po.expectedAt ? new Date(po.expectedAt).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) : null,
      notes: po.notes,
      currencySymbol: restaurant?.currencySymbol ?? "£",
      lines: po.lines.map((l) => ({ name: l.name, supplierCode: l.supplierCode, qty: l.qtyOrdered, unit: l.unit, unitCost: l.unitCost })),
      total: po.total,
    });
    if (!emailed) return { error: "The email couldn't be sent (email isn't set up for this business). Mark it as sent if you've ordered another way." };
  }
  await db.update(purchaseOrders).set({ status: "sent", sentAt: Date.now() }).where(eq(purchaseOrders.id, poId));
  revalidatePath("/purchase-orders");
  revalidatePath("/suppliers");
  return { id: poId, emailed };
}

export async function cancelPurchaseOrderAction(poId: string): Promise<PurchaseOrderResult> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "purchase-orders");
  const po = await getPurchaseOrder(restaurantId, poId);
  if (!po) return { error: "That purchase order no longer exists." };
  if (po.status === "received") return { error: "A received order can't be cancelled." };
  await db.update(purchaseOrders).set({ status: "cancelled" }).where(eq(purchaseOrders.id, poId));
  revalidatePath("/purchase-orders");
  revalidatePath("/suppliers");
  return { id: poId };
}

// Receive the rest and close: marks an order received even if the supplier shorted it.
export async function closePurchaseOrderAction(poId: string): Promise<PurchaseOrderResult> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "purchase-orders");
  const po = await getPurchaseOrder(restaurantId, poId);
  if (!po) return { error: "That purchase order no longer exists." };
  if (po.status !== "part_received") return { error: "Only a part-received order can be closed." };
  await db.update(purchaseOrders).set({ status: "received", receivedAt: Date.now() }).where(eq(purchaseOrders.id, poId));
  revalidatePath("/purchase-orders");
  return { id: poId };
}

// Reorder (step 4.7): one draft order per supplier from the suggested quantities.
export async function createOrdersFromReorderAction(
  groups: { supplierId: string; lines: { inventoryItemId: string; qty: number }[] }[]
): Promise<{ error?: string; ids?: string[] }> {
  const ids: string[] = [];
  for (const g of Array.isArray(groups) ? groups : []) {
    const res = await savePurchaseOrderAction(null, { supplierId: g.supplierId, lines: g.lines.map((l) => ({ inventoryItemId: l.inventoryItemId, qty: l.qty })) });
    if (res.error) return { error: res.error };
    ids.push(res.id!);
  }
  if (ids.length === 0) return { error: "Nothing to order." };
  return { ids };
}
