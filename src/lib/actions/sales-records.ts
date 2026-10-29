"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { orders, restaurants, shifts } from "@/db/schema";
import { summarizeShiftWindow } from "@/lib/data/shifts";
import { assertPermission, requireRestaurantContext } from "@/lib/scope";
import type { OrderChannel, OrderItem, PaymentLine } from "@/lib/types";

// Sales Records (app/sales-records): an admin correcting or removing the "final" entries — End
// Day reports and closed orders. Gated by the "sales-records" permission (admins always; staff
// only if granted). Deletes are permanent by design (the owner asked for that) — nothing keeps a
// copy, so the UI confirms first and says what changes.

export interface RecordActionState {
  error?: string;
}

async function scope() {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "sales-records");
  return { session, restaurantId };
}

function revalidateSales() {
  for (const path of ["/sales-records", "/dashboard", "/reports", "/order-line"]) revalidatePath(path);
}

const money = (n: unknown) => Math.round(Math.max(0, Number(n) || 0) * 100) / 100;

// ---------- End Day reports ----------

export interface ShiftRecordInput {
  openingBalance: number;
  cashCounted: number;
  terminalCounts: { method: string; counted: number }[];
  cashExpenses: number;
  cardExpenses: number;
  envelopeCash: number;
  notes: string;
  closedByName: string;
}

// The counted side of a report (what the manager entered at close). Expected cash is re-derived
// the same way endShiftAction does, and the restaurant's running envelope balance moves by the
// change in this report's envelope cash.
export async function updateShiftRecordAction(shiftId: string, input: ShiftRecordInput): Promise<RecordActionState> {
  const { restaurantId } = await scope();
  const [shift] = await db.select().from(shifts).where(and(eq(shifts.id, shiftId), eq(shifts.restaurantId, restaurantId))).limit(1);
  if (!shift) return { error: "That report no longer exists." };

  const openingBalance = money(input.openingBalance);
  const cashExpenses = money(input.cashExpenses);
  const envelopeCash = money(input.envelopeCash);
  const terminalCounts = (Array.isArray(input.terminalCounts) ? input.terminalCounts : [])
    .filter((c) => typeof c?.method === "string" && c.method.trim())
    .map((c) => ({ method: c.method.trim().slice(0, 60), counted: money(c.counted) }));

  await db
    .update(shifts)
    .set({
      openingBalance,
      cashCounted: money(input.cashCounted),
      terminalCounts,
      cashExpenses,
      cardExpenses: money(input.cardExpenses),
      envelopeCash,
      expectedCash: openingBalance + shift.cashSales - cashExpenses - envelopeCash,
      notes: input.notes.trim().slice(0, 2000) || null,
      closedByName: input.closedByName.trim().slice(0, 120) || shift.closedByName,
    })
    .where(eq(shifts.id, shiftId));

  const envelopeDelta = envelopeCash - shift.envelopeCash;
  if (Math.abs(envelopeDelta) >= 0.005) {
    await db
      .update(restaurants)
      .set({ envelopeCashBalance: sql`${restaurants.envelopeCashBalance} + ${envelopeDelta}` })
      .where(eq(restaurants.id, restaurantId));
  }
  revalidateSales();
  revalidatePath(`/shift-report/${shiftId}`);
  return {};
}

// Re-reads the report's own time window from the orders as they are now — for after orders in
// it were edited or deleted. Counted figures are left alone.
export async function recalculateShiftAction(shiftId: string): Promise<RecordActionState> {
  const { restaurantId } = await scope();
  const [shift] = await db.select().from(shifts).where(and(eq(shifts.id, shiftId), eq(shifts.restaurantId, restaurantId))).limit(1);
  if (!shift) return { error: "That report no longer exists." };
  const summary = await summarizeShiftWindow(restaurantId, shift.openedAt, shift.closedAt);
  await db
    .update(shifts)
    .set({ ...summary, expectedCash: shift.openingBalance + summary.expectedCash - shift.cashExpenses - shift.envelopeCash })
    .where(eq(shifts.id, shiftId));
  revalidateSales();
  revalidatePath(`/shift-report/${shiftId}`);
  return {};
}

// Permanent. Its envelope cash comes back off the running balance. Its orders aren't touched —
// if it was the latest report, the next End Day covers those orders again.
export async function deleteShiftRecordAction(shiftId: string): Promise<RecordActionState> {
  const { restaurantId } = await scope();
  const [shift] = await db.select().from(shifts).where(and(eq(shifts.id, shiftId), eq(shifts.restaurantId, restaurantId))).limit(1);
  if (!shift) return {};
  await db.delete(shifts).where(eq(shifts.id, shiftId));
  if (shift.envelopeCash > 0) {
    await db
      .update(restaurants)
      .set({ envelopeCashBalance: sql`max(0, ${restaurants.envelopeCashBalance} - ${shift.envelopeCash})` })
      .where(eq(restaurants.id, restaurantId));
  }
  revalidateSales();
  return {};
}

// ---------- Orders ----------

export interface OrderRecordInput {
  createdAt: number;
  channel: OrderChannel;
  tableNumber: number | null;
  guests: number;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  createdByName: string;
  items: { name: string; qty: number; price: number; dishId?: string; lineId?: string; note?: string; taxRate?: number }[];
  extraDiscount: number;
  payments: PaymentLine[];
  cashReceived: number | null;
}

const CHANNELS: OrderChannel[] = ["Dine in", "Wait List", "Take Away", "Delivery", "Online", "Third Party"];

export async function updateOrderRecordAction(orderId: string, input: OrderRecordInput): Promise<RecordActionState> {
  const { session, restaurantId } = await scope();
  const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId))).limit(1);
  if (!order) return { error: "That order no longer exists." };

  const createdAt = Number(input.createdAt);
  if (!Number.isFinite(createdAt) || createdAt < Date.UTC(2020, 0, 1) || createdAt > Date.now() + 24 * 60 * 60 * 1000) {
    return { error: "Pick a valid date and time." };
  }
  if (!CHANNELS.includes(input.channel)) return { error: "Pick an order type." };

  const items: OrderItem[] = [];
  for (const [i, raw] of (Array.isArray(input.items) ? input.items : []).entries()) {
    const name = String(raw?.name ?? "").trim().slice(0, 120);
    const qty = Math.round(Number(raw?.qty));
    const price = Math.round(Number(raw?.price) * 100) / 100;
    if (!name) continue;
    if (!Number.isFinite(qty) || qty < 1 || qty > 999) return { error: `Check the quantity for ${name}.` };
    if (!Number.isFinite(price) || price < 0 || price > 100000) return { error: `Check the price for ${name}.` };
    const existing = order.items.find((it) => (it.lineId ?? it.dishId) === (raw.lineId ?? raw.dishId));
    items.push({
      ...(existing ?? {}),
      dishId: existing?.dishId ?? raw.dishId ?? `custom:${crypto.randomUUID()}`,
      lineId: existing?.lineId ?? raw.lineId ?? `line-${i}-${crypto.randomUUID().slice(0, 8)}`,
      name,
      qty,
      price,
      note: raw.note?.trim() || existing?.note,
      taxRate: existing?.taxRate ?? raw.taxRate,
    } as OrderItem);
  }
  if (items.length === 0) return { error: "An order needs at least one item — delete it instead." };

  const payments = (Array.isArray(input.payments) ? input.payments : [])
    .map((p) => ({ method: String(p?.method ?? "").trim().slice(0, 60), amount: money(p?.amount) }))
    .filter((p) => p.method && p.amount > 0);
  // One line per method, like the Till keeps it.
  const merged = new Map<string, number>();
  for (const p of payments) merged.set(p.method, Math.round(((merged.get(p.method) ?? 0) + p.amount) * 100) / 100);
  const lines = [...merged.entries()].map(([method, amount]) => ({ method, amount }));

  await db
    .update(orders)
    .set({
      createdAt,
      channel: input.channel,
      tableNumber: input.channel === "Dine in" || input.channel === "Wait List" ? input.tableNumber || null : null,
      tableId: input.tableNumber === order.tableNumber ? order.tableId : null,
      guests: Math.max(1, Math.min(99, Math.round(Number(input.guests) || 1))),
      customerName: input.customerName.trim().slice(0, 120) || null,
      customerPhone: input.customerPhone.trim().slice(0, 40) || null,
      customerAddress: input.customerAddress.trim().slice(0, 300) || null,
      createdByName: input.createdByName.trim().slice(0, 120) || order.createdByName,
      items,
      extraDiscount: money(input.extraDiscount),
      paymentMethod: lines.length === 0 ? null : lines.length === 1 ? lines[0].method : "Split",
      payments: lines.length > 1 ? lines : null,
      cashReceived: lines.some((l) => l.method === "Cash") && input.cashReceived ? money(input.cashReceived) : null,
      updatedAt: Date.now(),
    })
    .where(eq(orders.id, orderId));

  console.log(`[sales-records] order ${order.orderNumber} edited by ${session.name}`);
  revalidateSales();
  return {};
}

// Permanent. Print jobs and card-machine records that pointed at it keep their own rows (their
// order link becomes empty). Stock that was used isn't put back.
export async function deleteOrderRecordAction(orderId: string): Promise<RecordActionState> {
  const { session, restaurantId } = await scope();
  const [order] = await db
    .select({ orderNumber: orders.orderNumber })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)))
    .limit(1);
  if (!order) return {};
  await db.delete(orders).where(eq(orders.id, orderId));
  console.log(`[sales-records] order ${order.orderNumber} deleted by ${session.name}`);
  revalidateSales();
  return {};
}
