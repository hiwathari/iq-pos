"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { orders, refunds } from "@/db/schema";
import { assertPermission, requireRestaurantContext } from "@/lib/scope";
import { itemsSubtotal, lineTotal, orderBreakdown, roundMoney, type OrderItem } from "@/lib/types";
import { listRefundsForOrder } from "@/lib/data/refunds";
import { applyStockChanges, stockUsageForItems } from "@/lib/stock";
import { issueStoreCredit } from "@/lib/data/store-credit";
import { tradeAccounts } from "@/db/schema";
import { releaseSerials } from "@/lib/data/serials";
import { serialNumbers } from "@/db/schema";

// Refunds and returns on the Till (docs/retail-plan step 3.7). A paid sale can be refunded in
// parts: chosen lines (and how much of each), back to cash or a card machine, optionally putting
// the goods back into stock. Each line refunds what the customer actually paid for it — its
// share of any order discount comes off, and its tax is added back — and the total can never go
// past what the sale took. Card refunds are made on the card machine itself; this records them.

export interface RefundLineInput {
  lineId: string;
  qty: number;
  backToStock: boolean;
}

export interface RefundResult {
  error?: string;
  refund?: {
    credit?: { code: string; amount: number }; id: string; number: string; amount: number; tax: number; method: string; lines: { name: string; qty: number; amount: number; sellBy?: string; unit?: string }[] };
}

export async function refundOrderAction(orderId: string, input: { lines: RefundLineInput[]; method: string; reason: string }): Promise<RefundResult> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "till-refund");

  const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId))).limit(1);
  if (!order) return { error: "That sale no longer exists." };
  if (order.status === "Voided") return { error: "A voided sale can't be refunded." };
  if (!order.paymentMethod) return { error: "This sale hasn't been paid, so there's nothing to refund — edit or void it instead." };
  const method = String(input?.method ?? "").trim().slice(0, 60);
  if (!method) return { error: "Choose how the money goes back." };

  const previous = await listRefundsForOrder(restaurantId, orderId);
  const refundedQty = new Map<string, number>();
  for (const r of previous) for (const l of r.items) refundedQty.set(l.lineId, (refundedQty.get(l.lineId) ?? 0) + l.qty);

  const breakdown = orderBreakdown(order);
  const subtotal = itemsSubtotal(order.items);
  const factor = subtotal > 0 ? (subtotal - breakdown.discount) / subtotal : 0;

  const lines: { lineId: string; name: string; qty: number; amount: number; backToStock: boolean; item: OrderItem }[] = [];
  let tax = 0;
  for (const req of Array.isArray(input?.lines) ? input.lines : []) {
    const item = order.items.find((i) => (i.lineId ?? i.dishId) === req.lineId);
    if (!item) return { error: "One of those lines isn't on this sale." };
    const left = Math.round((item.qty - (refundedQty.get(req.lineId) ?? 0)) * 1000) / 1000;
    const qty = Math.round(Number(req.qty) * 1000) / 1000;
    if (!(qty > 0)) continue;
    if (qty > left + 1e-9) return { error: `Only ${left} of ${item.name} is left to refund.` };
    const share = qty / item.qty;
    const net = lineTotal(item) * factor * share;
    const lineTax = lineTotal(item) * ((item.taxRate ?? 0) / 100) * factor * share;
    tax += lineTax;
    lines.push({ lineId: req.lineId, name: item.name, qty, amount: roundMoney(net + lineTax), backToStock: !!req.backToStock, item });
  }
  if (lines.length === 0) return { error: "Choose what's being refunded." };

  let amount = roundMoney(lines.reduce((s, l) => s + l.amount, 0));
  const remaining = roundMoney(orderBreakdown(order).total - (order.refundedAmount ?? 0));
  if (amount > remaining) amount = remaining; // rounding on the last part-refund
  if (amount <= 0) return { error: "This sale has already been refunded in full." };

  // A refund given as store credit becomes a slip with a barcode, usable as payment later.
  // A refund "On account" is a credit note: it comes off what the trade customer owes.
  if (method === "On account") {
    if (!order.tradeAccountId) return { error: "This sale isn't on a trade account." };
    await db.update(tradeAccounts).set({ balance: sql`round(${tradeAccounts.balance} - ${amount}, 2)` }).where(eq(tradeAccounts.id, order.tradeAccountId));
  }
  const credit = method === "Store credit" ? await issueStoreCredit(restaurantId, amount, { customerName: order.customerName, sourceOrderId: orderId, byName: session.name }) : undefined;

  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(refunds).where(eq(refunds.restaurantId, restaurantId));
  const number = `R${String(Number(n) + 1).padStart(4, "0")}`;
  const [row] = await db
    .insert(refunds)
    .values({
      restaurantId,
      orderId,
      number,
      items: lines.map(({ lineId, name, qty, amount: a, backToStock }) => ({ lineId, name, qty, amount: a, backToStock })),
      amount,
      tax: roundMoney(tax),
      method,
      reason: String(input?.reason ?? "").trim().slice(0, 200) || null,
      createdByName: session.name,
    })
    .returning({ id: refunds.id });
  await db
    .update(orders)
    .set({ refundedAmount: roundMoney((order.refundedAmount ?? 0) + amount) })
    .where(eq(orders.id, orderId));

  // Returned goods go back into stock (logged against the sale, so a later void of the same
  // sale only gives back what's still out).
  // Refunded serial numbers: back on the shelf when the goods go back to stock, otherwise
  // "returned" (faulty / written off) — they can be found by serial either way.
  for (const l of lines) {
    const serials = l.item.serials ?? [];
    if (serials.length === 0) continue;
    if (l.backToStock) await releaseSerials(restaurantId, serials);
    else await db.update(serialNumbers).set({ status: "returned" }).where(and(eq(serialNumbers.restaurantId, restaurantId), inArray(serialNumbers.serial, serials)));
  }
  const back = lines.filter((l) => l.backToStock).map((l) => ({ ...l.item, qty: l.qty }));
  if (back.length) {
    const usage = await stockUsageForItems(restaurantId, back);
    await applyStockChanges(restaurantId, usage, { reason: "refund", referenceId: orderId, byName: session.name, note: `Refund ${number}` });
  }

  revalidatePath("/order-line");
  revalidatePath("/inventory");
  revalidatePath("/reports");
  revalidatePath("/sales-records");
  return {
    refund: {
      credit,
      id: row.id,
      number,
      amount,
      tax: roundMoney(tax),
      method,
      lines: lines.map((l) => ({ name: l.name, qty: l.qty, amount: l.amount, sellBy: l.item.sellBy, unit: l.item.unit })),
    },
  };
}

// What's already been refunded on a sale, line by line — for the refund popup.
export async function refundedLinesAction(orderId: string): Promise<Record<string, number>> {
  const { restaurantId } = await requireRestaurantContext();
  const out: Record<string, number> = {};
  for (const r of await listRefundsForOrder(restaurantId, orderId)) for (const l of r.items) out[l.lineId] = (out[l.lineId] ?? 0) + l.qty;
  return out;
}
