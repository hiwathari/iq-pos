import "server-only";
import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { categories, dishes, inventoryItems, loyaltyMembers, orders, shifts } from "@/db/schema";
import { filterOrdersForAccountsRole } from "@/lib/accounts-filter";
import { businessDateKey, getLocalParts } from "@/lib/business-day";
import { orderBreakdown, orderTotal, shiftTotals, type Order } from "@/lib/types";
import type { BusinessDayConfig } from "./reports";

// The Reports "Dashboard" and the newer report tabs (Items, Discounts, Voids, Tax, Customers &
// Loyalty, Tables, Kitchen Speed, End Day, Stock). Everything is computed from the same orders
// the other tabs use, for the chosen range — plus the same-length period just before it, so the
// headline figures can show a change. Item revenue is before discounts (like the other item
// reports); order and sales totals are after discounts, tax included (orderTotal).

export type ReportInsights = Awaited<ReturnType<typeof getReportInsights>>;

interface Kpis {
  netSales: number;
  moneyTaken: number;
  orders: number;
  aov: number;
  guests: number;
  perGuest: number;
  itemsSold: number;
  discounts: number;
  tax: number;
  voidCount: number;
  voidAmount: number;
  unpaidCount: number;
  unpaidAmount: number;
  customerOrders: number;
  customerOrderSales: number;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_MINUTES = 6 * 60; // anything longer is a ticket left open, not a real time

function paymentLines(o: Order) {
  const total = orderTotal(o);
  return o.payments?.length ? o.payments : o.paymentMethod ? [{ method: o.paymentMethod, amount: total }] : [];
}

function kpisFor(list: Order[]): Kpis {
  const live = list.filter((o) => o.status !== "Voided");
  const voided = list.filter((o) => o.status === "Voided");
  let netSales = 0;
  let moneyTaken = 0;
  let guests = 0;
  let itemsSold = 0;
  let discounts = 0;
  let tax = 0;
  let unpaidCount = 0;
  let unpaidAmount = 0;
  let customerOrders = 0;
  let customerOrderSales = 0;
  for (const o of live) {
    const b = orderBreakdown(o);
    netSales += b.total;
    tax += b.tax;
    discounts += Math.min(b.subtotal, (o.extraDiscount ?? 0) + (o.couponDiscount ?? 0));
    guests += o.guests ?? 0;
    itemsSold += o.items.reduce((s, i) => s + i.qty, 0);
    const paid = paymentLines(o).reduce((s, p) => s + p.amount, 0);
    moneyTaken += paid;
    if (!o.paymentMethod) {
      unpaidCount += 1;
      unpaidAmount += b.total;
    }
    if (o.placedVia && o.placedVia !== "staff") {
      customerOrders += 1;
      customerOrderSales += b.total;
    }
  }
  return {
    netSales,
    moneyTaken,
    orders: live.length,
    aov: live.length ? netSales / live.length : 0,
    guests,
    perGuest: guests ? netSales / guests : 0,
    itemsSold,
    discounts,
    tax,
    voidCount: voided.length,
    voidAmount: voided.reduce((s, o) => s + orderTotal(o), 0),
    unpaidCount,
    unpaidAmount,
    customerOrders,
    customerOrderSales,
  };
}

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
}

export async function getReportInsights(
  restaurantId: string,
  range: { from: number; to: number },
  accountsFilter: { defaultTerminalName: string | null } | undefined,
  businessDay: BusinessDayConfig
) {
  const span = Math.max(1, range.to - range.from);
  const prevFrom = range.from - span;

  const [fetched, allDishes, allCategories, members, stock, shiftRows] = await Promise.all([
    db.select().from(orders).where(and(eq(orders.restaurantId, restaurantId), gte(orders.createdAt, prevFrom), lt(orders.createdAt, range.to))),
    db.select().from(dishes).where(eq(dishes.restaurantId, restaurantId)),
    db.select().from(categories).where(eq(categories.restaurantId, restaurantId)),
    db.select().from(loyaltyMembers).where(eq(loyaltyMembers.restaurantId, restaurantId)),
    db.select().from(inventoryItems).where(eq(inventoryItems.restaurantId, restaurantId)),
    db
      .select()
      .from(shifts)
      .where(and(eq(shifts.restaurantId, restaurantId), gte(shifts.closedAt, range.from), lt(shifts.closedAt, range.to))),
  ]);
  const all = (accountsFilter ? filterOrdersForAccountsRole(fetched, accountsFilter.defaultTerminalName) : fetched) as Order[];
  const current = all.filter((o) => o.createdAt >= range.from);
  const previous = all.filter((o) => o.createdAt < range.from);
  const live = current.filter((o) => o.status !== "Voided");

  const kpis = { current: kpisFor(current), previous: kpisFor(previous) };

  // ---- Trend: each day of the range next to the matching day of the previous period ----
  const dayCount = Math.max(1, Math.round(span / 86_400_000));
  const dayKey = (ts: number) => businessDateKey(ts, businessDay.openTime, businessDay.timezone);
  const curByDay = new Map<string, number>();
  for (const o of live) curByDay.set(dayKey(o.createdAt), (curByDay.get(dayKey(o.createdAt)) ?? 0) + orderTotal(o));
  const prevByDay = new Map<string, number>();
  for (const o of previous.filter((x) => x.status !== "Voided")) prevByDay.set(dayKey(o.createdAt), (prevByDay.get(dayKey(o.createdAt)) ?? 0) + orderTotal(o));
  const trend = Array.from({ length: Math.min(dayCount, 120) }, (_, i) => {
    const curTs = range.from + i * 86_400_000 + 3_600_000;
    const prevTs = prevFrom + i * 86_400_000 + 3_600_000;
    const k = dayKey(curTs);
    return { label: k.slice(5), current: curByDay.get(k) ?? 0, previous: prevByDay.get(dayKey(prevTs)) ?? 0 };
  });

  // ---- Busy times: weekday × hour ----
  const heat = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ revenue: 0, orders: 0 })));
  for (const o of live) {
    const parts = getLocalParts(o.createdAt, businessDay.timezone);
    const weekday = (new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay() + 6) % 7;
    heat[weekday][parts.hour].revenue += orderTotal(o);
    heat[weekday][parts.hour].orders += 1;
  }

  // ---- Items ----
  const categoryName = new Map(allCategories.map((c) => [c.id, c.name]));
  const dishById = new Map(allDishes.map((d) => [d.id, d]));
  const itemMap = new Map<string, { name: string; category: string; qty: number; revenue: number; orderIds: Set<string> }>();
  for (const o of live) {
    for (const it of o.items) {
      const dish = dishById.get(it.dishId);
      const key = dish ? dish.id : `name:${it.name.toLowerCase()}`;
      const row = itemMap.get(key) ?? { name: it.name, category: dish ? (categoryName.get(dish.categoryId) ?? "Other") : "Custom / Other", qty: 0, revenue: 0, orderIds: new Set<string>() };
      row.qty += it.qty;
      row.revenue += it.price * it.qty;
      row.orderIds.add(o.id);
      itemMap.set(key, row);
    }
  }
  const itemRevenueTotal = [...itemMap.values()].reduce((s, r) => s + r.revenue, 0);
  const items = [...itemMap.entries()]
    .map(([key, r]) => ({
      key,
      name: r.name,
      category: r.category,
      qty: r.qty,
      revenue: r.revenue,
      orders: r.orderIds.size,
      avgPrice: r.qty ? r.revenue / r.qty : 0,
      share: itemRevenueTotal ? r.revenue / itemRevenueTotal : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
  const soldDishIds = new Set([...itemMap.keys()]);
  const slowMovers = allDishes
    .filter((d) => !soldDishIds.has(d.id))
    .map((d) => ({ name: d.name, category: categoryName.get(d.categoryId) ?? "Other", price: d.price, outOfStock: d.outOfStock }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  // ---- Discounts & coupons ----
  const couponMap = new Map<string, { code: string; uses: number; amount: number; sales: number }>();
  const discountByStaff = new Map<string, { name: string; count: number; amount: number }>();
  let extraCount = 0;
  let extraAmount = 0;
  for (const o of live) {
    const total = orderTotal(o);
    if (o.couponCode && (o.couponDiscount ?? 0) > 0) {
      const row = couponMap.get(o.couponCode) ?? { code: o.couponCode, uses: 0, amount: 0, sales: 0 };
      row.uses += 1;
      row.amount += o.couponDiscount ?? 0;
      row.sales += total;
      couponMap.set(o.couponCode, row);
    }
    const disc = (o.extraDiscount ?? 0) + (o.couponDiscount ?? 0);
    if ((o.extraDiscount ?? 0) > 0) {
      extraCount += 1;
      extraAmount += o.extraDiscount ?? 0;
    }
    if (disc > 0) {
      const name = o.createdByName ?? "Unattributed";
      const row = discountByStaff.get(name) ?? { name, count: 0, amount: 0 };
      row.count += 1;
      row.amount += disc;
      discountByStaff.set(name, row);
    }
  }
  const discounts = {
    coupons: [...couponMap.values()].sort((a, b) => b.amount - a.amount),
    extraCount,
    extraAmount,
    byStaff: [...discountByStaff.values()].sort((a, b) => b.amount - a.amount),
    discountedOrders: live.filter((o) => (o.extraDiscount ?? 0) + (o.couponDiscount ?? 0) > 0).length,
  };

  // ---- Voids ----
  const voidedOrders = current.filter((o) => o.status === "Voided");
  const voidList = voidedOrders
    .map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      createdAt: o.createdAt,
      staff: o.createdByName ?? "Unattributed",
      channel: o.channel,
      amount: orderTotal(o),
      reason: o.voidReason?.trim() || "No reason given",
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
  const group = <T extends { amount: number }>(list: T[], key: (x: T) => string) => {
    const m = new Map<string, { name: string; count: number; amount: number }>();
    for (const x of list) {
      const k = key(x);
      const row = m.get(k) ?? { name: k, count: 0, amount: 0 };
      row.count += 1;
      row.amount += x.amount;
      m.set(k, row);
    }
    return [...m.values()].sort((a, b) => b.amount - a.amount);
  };
  const voids = { list: voidList, byStaff: group(voidList, (v) => v.staff), byReason: group(voidList, (v) => v.reason) };

  // ---- Tax, by rate ----
  const taxMap = new Map<number, { rate: number; net: number; tax: number }>();
  for (const o of live) {
    const subtotal = o.items.reduce((s, i) => s + i.price * i.qty, 0);
    const discount = Math.min(subtotal, (o.extraDiscount ?? 0) + (o.couponDiscount ?? 0));
    const factor = subtotal > 0 ? (subtotal - discount) / subtotal : 0;
    for (const it of o.items) {
      const rate = it.taxRate ?? 0;
      const net = it.price * it.qty * factor;
      const row = taxMap.get(rate) ?? { rate, net: 0, tax: 0 };
      row.net += net;
      row.tax += net * (rate / 100);
      taxMap.set(rate, row);
    }
  }
  const tax = [...taxMap.values()].sort((a, b) => b.rate - a.rate);

  // ---- Customers & loyalty ----
  const custMap = new Map<string, { name: string; contact: string; orders: number; spend: number; last: number }>();
  let loyaltyOrders = 0;
  let loyaltySales = 0;
  const memberById = new Map(members.map((m) => [m.id, m]));
  for (const o of live) {
    const total = orderTotal(o);
    if (o.loyaltyMemberId) {
      loyaltyOrders += 1;
      loyaltySales += total;
    }
    const member = o.loyaltyMemberId ? memberById.get(o.loyaltyMemberId) : undefined;
    const contact = (member?.contactValue ?? o.customerPhone ?? "").trim().toLowerCase();
    if (!contact) continue;
    const row = custMap.get(contact) ?? { name: member?.name || o.customerName || "—", contact, orders: 0, spend: 0, last: 0 };
    row.orders += 1;
    row.spend += total;
    row.last = Math.max(row.last, o.createdAt);
    if (row.name === "—" && (member?.name || o.customerName)) row.name = (member?.name || o.customerName) as string;
    custMap.set(contact, row);
  }
  const customerRows = [...custMap.values()].sort((a, b) => b.spend - a.spend);
  const customers = {
    identified: customerRows.length,
    repeat: customerRows.filter((c) => c.orders > 1).length,
    top: customerRows.slice(0, 25),
    loyaltyOrders,
    loyaltySales,
    totalMembers: members.length,
    newMembers: members.filter((m) => m.createdAt >= range.from && m.createdAt < range.to).length,
  };

  // ---- Tables (dine-in) ----
  const tableMap = new Map<number, { table: number; orders: number; guests: number; revenue: number; minutes: number[] }>();
  for (const o of live) {
    if (!o.tableNumber) continue;
    const row = tableMap.get(o.tableNumber) ?? { table: o.tableNumber, orders: 0, guests: 0, revenue: 0, minutes: [] };
    row.orders += 1;
    row.guests += o.guests ?? 0;
    row.revenue += orderTotal(o);
    const end = o.closedOutAt ?? null;
    if (end && end > o.createdAt) {
      const min = (end - o.createdAt) / 60_000;
      if (min <= MAX_MINUTES) row.minutes.push(min);
    }
    tableMap.set(o.tableNumber, row);
  }
  const tables = [...tableMap.values()]
    .map((t) => ({
      table: t.table,
      orders: t.orders,
      guests: t.guests,
      revenue: t.revenue,
      avgSpend: t.orders ? t.revenue / t.orders : 0,
      perCover: t.guests ? t.revenue / t.guests : 0,
      avgMinutes: t.minutes.length ? t.minutes.reduce((a, b) => a + b, 0) / t.minutes.length : null,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // ---- Kitchen speed: order placed → served ----
  const speedAll: number[] = [];
  const speedByChannel = new Map<string, number[]>();
  for (const o of live) {
    if (!o.servedAt || o.servedAt <= o.createdAt) continue;
    const min = (o.servedAt - o.createdAt) / 60_000;
    if (min > MAX_MINUTES) continue;
    speedAll.push(min);
    const list = speedByChannel.get(o.channel) ?? [];
    list.push(min);
    speedByChannel.set(o.channel, list);
  }
  const sortedSpeed = [...speedAll].sort((a, b) => a - b);
  const speed = {
    count: speedAll.length,
    avg: speedAll.length ? speedAll.reduce((a, b) => a + b, 0) / speedAll.length : 0,
    median: percentile(sortedSpeed, 0.5),
    p90: percentile(sortedSpeed, 0.9),
    byChannel: [...speedByChannel.entries()]
      .map(([channel, list]) => {
        const s = [...list].sort((a, b) => a - b);
        return { channel, count: list.length, avg: list.reduce((a, b) => a + b, 0) / list.length, median: percentile(s, 0.5), p90: percentile(s, 0.9) };
      })
      .sort((a, b) => b.count - a.count),
  };

  // ---- Staff ----
  const staffMap = new Map<string, { name: string; orders: number; revenue: number; guests: number; voids: number; discounts: number }>();
  for (const o of current) {
    const name = o.createdByName ?? "Unattributed";
    const row = staffMap.get(name) ?? { name, orders: 0, revenue: 0, guests: 0, voids: 0, discounts: 0 };
    if (o.status === "Voided") row.voids += 1;
    else {
      row.orders += 1;
      row.revenue += orderTotal(o);
      row.guests += o.guests ?? 0;
      row.discounts += (o.extraDiscount ?? 0) + (o.couponDiscount ?? 0);
    }
    staffMap.set(name, row);
  }
  const staff = [...staffMap.values()].map((s) => ({ ...s, avg: s.orders ? s.revenue / s.orders : 0 })).sort((a, b) => b.revenue - a.revenue);

  // ---- Breakdown lists for the dashboard ----
  const tally = (key: (o: Order) => string) => {
    const m = new Map<string, number>();
    for (const o of live) m.set(key(o), (m.get(key(o)) ?? 0) + orderTotal(o));
    return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  };
  const byChannel = tally((o) => (o.channel === "Third Party" && o.thirdPartyProvider ? o.thirdPartyProvider : o.channel));
  const byPayment = (() => {
    const m = new Map<string, number>();
    for (const o of live) {
      const lines = paymentLines(o);
      if (lines.length === 0) m.set("Unpaid", (m.get("Unpaid") ?? 0) + orderTotal(o));
      for (const l of lines) m.set(l.method, (m.get(l.method) ?? 0) + l.amount);
    }
    return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  })();
  const byCategory = (() => {
    const m = new Map<string, number>();
    for (const it of items) m.set(it.category, (m.get(it.category) ?? 0) + it.revenue);
    return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  })();

  // ---- End Day reports in range ----
  const endDays = shiftRows
    .map((s) => {
      const t = shiftTotals(s);
      return { id: s.id, closedAt: s.closedAt, closedBy: s.closedByName ?? "—", orders: s.orderCount, pos: t.posTotal, counted: t.finalTotal, difference: t.difference, notes: s.notes };
    })
    .sort((a, b) => b.closedAt - a.closedAt);

  // ---- Stock ----
  const lowStock = stock
    .filter((s) => s.quantity <= s.lowStockThreshold)
    .map((s) => ({ name: s.name, quantity: s.quantity, unit: s.unit, threshold: s.lowStockThreshold }))
    .sort((a, b) => a.quantity - b.quantity);
  const stockAll = stock.map((s) => ({ name: s.name, quantity: s.quantity, unit: s.unit, threshold: s.lowStockThreshold, low: s.quantity <= s.lowStockThreshold })).sort((a, b) => a.name.localeCompare(b.name));

  // ---- Best and quietest days in range ----
  const days = [...curByDay.entries()].map(([date, revenue]) => ({ date, revenue })).sort((a, b) => b.revenue - a.revenue);

  return {
    kpis,
    trend,
    heat,
    dayLabels: DAY_LABELS,
    items,
    slowMovers,
    discounts,
    voids,
    tax,
    customers,
    tables,
    speed,
    staff,
    byChannel,
    byPayment,
    byCategory,
    endDays,
    lowStock,
    stockAll,
    bestDay: days[0] ?? null,
    quietestDay: days.length > 1 ? days[days.length - 1] : null,
    daysTraded: days.length,
  };
}
