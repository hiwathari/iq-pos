import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { categories, dishes, orders, pettyCashEntries, reservations } from "@/db/schema";
import { orderTotal, orderSequence } from "@/lib/types";
import { filterOrdersForAccountsRole } from "@/lib/accounts-filter";

export type ReportData = Awaited<ReturnType<typeof getReportData>>;

// `from`/`to` are optional timestamps (from inclusive, to exclusive) — omitting both keeps the
// original all-time behavior the Dashboard relies on; the Reports page's date filter passes them.
// `accountsFilter` restricts the order set for the "accounts" role (see lib/accounts-filter.ts)
// before anything below aggregates it — every number this function returns already reflects it.
export async function getReportData(
  restaurantId: string,
  range?: { from?: number; to?: number },
  accountsFilter?: { defaultTerminalName: string | null }
) {
  const orderConditions = [eq(orders.restaurantId, restaurantId)];
  const reservationConditions = [eq(reservations.restaurantId, restaurantId)];
  if (range?.from !== undefined) {
    orderConditions.push(gte(orders.createdAt, range.from));
    reservationConditions.push(gte(reservations.createdAt, range.from));
  }
  if (range?.to !== undefined) {
    orderConditions.push(lt(orders.createdAt, range.to));
    reservationConditions.push(lt(reservations.createdAt, range.to));
  }

  const [fetchedOrders, allReservations, allDishes, allCategories] = await Promise.all([
    db.select().from(orders).where(and(...orderConditions)),
    db.select().from(reservations).where(and(...reservationConditions)),
    db.select().from(dishes).where(eq(dishes.restaurantId, restaurantId)),
    db.select().from(categories).where(eq(categories.restaurantId, restaurantId)),
  ]);
  const allOrders = accountsFilter ? filterOrdersForAccountsRole(fetchedOrders, accountsFilter.defaultTerminalName) : fetchedOrders;

  const categoryNameById = new Map(allCategories.map((c) => [c.id, c.name]));
  const categoryNameByDishId = new Map(allDishes.map((d) => [d.id, categoryNameById.get(d.categoryId) ?? "Other"]));

  const liveOrders = allOrders.filter((o) => o.status !== "Voided");
  const voidedOrders = allOrders.filter((o) => o.status === "Voided");

  let cashSales = 0;
  let cardSales = 0;
  let otherSales = 0;
  let totalGuests = 0;
  let totalTax = 0;
  const itemQty = new Map<string, number>();
  const itemRevenue = new Map<string, number>();
  const channelMap = new Map<string, { revenue: number; count: number }>();
  const paymentMethodMap = new Map<string, number>();
  const staffMap = new Map<string, { revenue: number; count: number }>();
  const categoryMap = new Map<string, { revenue: number; qty: number }>();
  const dailyMap = new Map<string, number>();
  const hourlyMap = new Map<number, number>();

  const bump = (map: Map<string, { revenue: number; count: number }>, key: string, amount: number) => {
    const existing = map.get(key) ?? { revenue: 0, count: 0 };
    existing.revenue += amount;
    existing.count += 1;
    map.set(key, existing);
  };

  for (const o of liveOrders) {
    const total = orderTotal(o);
    const subtotal = o.items.reduce((sum, i) => sum + i.price * i.qty, 0);

    // Split-payment orders carry the true per-method breakdown; everything else falls back
    // to the single paymentMethod string (legacy orders, or the common single-method case).
    const methodLines = o.payments?.length ? o.payments : o.paymentMethod ? [{ method: o.paymentMethod, amount: total }] : [];
    for (const line of methodLines) {
      if (line.method === "Cash") cashSales += line.amount;
      else cardSales += line.amount;
      paymentMethodMap.set(line.method, (paymentMethodMap.get(line.method) ?? 0) + line.amount);
    }
    if (methodLines.length === 0) otherSales += total;

    const channelKey = o.channel === "Third Party" && o.thirdPartyProvider ? o.thirdPartyProvider : o.channel;
    bump(channelMap, channelKey, total);

    bump(staffMap, o.createdByName ?? "Unattributed", total);

    totalGuests += o.guests ?? 0;
    // Mirrors orderTotal()'s tax math: each item's own snapshotted rate, discount applied
    // proportionally across the tax base — 0 for every order placed while tax was disabled.
    const discount = Math.min(subtotal, (o.extraDiscount ?? 0) + (o.couponDiscount ?? 0));
    const discountFactor = subtotal > 0 ? (subtotal - discount) / subtotal : 0;
    const rawTax = o.items.reduce((sum, i) => sum + i.price * i.qty * ((i.taxRate ?? 0) / 100), 0);
    totalTax += rawTax * discountFactor;

    const dateKey = new Date(o.createdAt).toISOString().slice(0, 10);
    dailyMap.set(dateKey, (dailyMap.get(dateKey) ?? 0) + total);
    const hour = new Date(o.createdAt).getHours();
    hourlyMap.set(hour, (hourlyMap.get(hour) ?? 0) + total);

    for (const item of o.items) {
      itemQty.set(item.name, (itemQty.get(item.name) ?? 0) + item.qty);
      itemRevenue.set(item.name, (itemRevenue.get(item.name) ?? 0) + item.price * item.qty);

      const catName = categoryNameByDishId.get(item.dishId) ?? "Custom / Other";
      const catEntry = categoryMap.get(catName) ?? { revenue: 0, qty: 0 };
      catEntry.revenue += item.price * item.qty;
      catEntry.qty += item.qty;
      categoryMap.set(catName, catEntry);
    }
  }

  const totalSales = cashSales + cardSales + otherSales;
  const voidOrderAmount = voidedOrders.reduce((sum, o) => sum + orderTotal(o), 0);

  const customerNames = new Set(
    allReservations.map((r) => r.customerName).filter((n) => n && n !== "Available Now")
  );

  const itemWiseSoldQty = [...itemQty.entries()]
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty);

  const itemWiseRevenue = [...itemRevenue.entries()]
    .map(([name, revenue]) => ({ name, revenue }))
    .sort((a, b) => b.revenue - a.revenue);

  const byChannel = [...channelMap.entries()]
    .map(([channel, v]) => ({ channel, ...v }))
    .sort((a, b) => b.revenue - a.revenue);

  const byPaymentMethod = [...paymentMethodMap.entries()]
    .map(([method, revenue]) => ({ method, revenue }))
    .sort((a, b) => b.revenue - a.revenue);

  const byStaff = [...staffMap.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenue - a.revenue);

  const byCategory = [...categoryMap.entries()]
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.revenue - a.revenue);

  const dailySales = [...dailyMap.entries()]
    .map(([date, revenue]) => ({ date, revenue }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30);

  const hourlySales = Array.from({ length: 24 }, (_, hour) => ({ hour, revenue: hourlyMap.get(hour) ?? 0 }));

  const averageOrderValue = liveOrders.length > 0 ? totalSales / liveOrders.length : 0;
  const averagePartySize = liveOrders.length > 0 ? totalGuests / liveOrders.length : 0;

  return {
    totalCustomers: customerNames.size,
    itemWiseSoldQty,
    itemWiseRevenue,
    cashSales,
    cardSales,
    otherSales,
    totalSales,
    voidOrderAmount,
    voidOrderCount: voidedOrders.length,
    orderCount: liveOrders.length,
    byChannel,
    byPaymentMethod,
    byStaff,
    byCategory,
    dailySales,
    hourlySales,
    averageOrderValue,
    averagePartySize,
    totalGuests,
    totalTax,
  };
}

export type DailySummary = Awaited<ReturnType<typeof getDailySummary>>;

// One calendar day (UTC, matching the daily/hourly buckets above), laid out the way an end-of-day
// cash-up sheet reads: every order placed that day, the sale items behind them, any petty cash
// movement, anything cancelled, then a reconciliation block a manager can check the till against.
// There's no opening-float carry-forward yet, so openingBalance is always 0 — a restaurant that
// starts its drawer with a float would need to fold that in manually for now.
export async function getDailySummary(restaurantId: string, dateStr: string, accountsFilter?: { defaultTerminalName: string | null }) {
  const from = new Date(`${dateStr}T00:00:00.000Z`).getTime();
  const to = from + 24 * 60 * 60 * 1000;

  const [fetchedDayOrders, dayPettyCash, dayReservations] = await Promise.all([
    db
      .select()
      .from(orders)
      .where(and(eq(orders.restaurantId, restaurantId), gte(orders.createdAt, from), lt(orders.createdAt, to))),
    db
      .select()
      .from(pettyCashEntries)
      .where(and(eq(pettyCashEntries.restaurantId, restaurantId), gte(pettyCashEntries.createdAt, from), lt(pettyCashEntries.createdAt, to))),
    db
      .select()
      .from(reservations)
      .where(and(eq(reservations.restaurantId, restaurantId), gte(reservations.createdAt, from), lt(reservations.createdAt, to))),
  ]);
  const dayOrders = accountsFilter ? filterOrdersForAccountsRole(fetchedDayOrders, accountsFilter.defaultTerminalName) : fetchedDayOrders;

  const liveOrders = dayOrders.filter((o) => o.status !== "Voided");
  const voidedOrders = dayOrders.filter((o) => o.status === "Voided");

  const ordersList = liveOrders
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((o, idx) => ({
      sn: idx + 1,
      orderNumber: o.orderNumber,
      seq: orderSequence(o.orderNumber),
      mode: (o.placedVia === "staff" ? "offline" : "online") as "online" | "offline",
      type: o.channel === "Dine in" ? "dinein" : o.channel === "Take Away" ? "takeaway" : o.channel.toLowerCase(),
      totalPayable: orderTotal(o),
    }));
  const ordersSum = ordersList.reduce((sum, o) => sum + o.totalPayable, 0);

  const saleItemsMap = new Map<string, number>();
  for (const o of liveOrders) {
    for (const item of o.items) saleItemsMap.set(item.name, (saleItemsMap.get(item.name) ?? 0) + item.qty);
  }
  const saleItems = [...saleItemsMap.entries()].map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty);

  const cancelledOrders = voidedOrders.map((o) => ({
    orderNumber: o.orderNumber,
    seq: orderSequence(o.orderNumber),
    reason: o.voidReason,
    amount: orderTotal(o),
  }));

  let totalCashAmount = 0;
  let totalCardAmount = 0;
  let totalOnlineCardAmount = 0;
  let totalInStoreCashOrders = 0;
  let totalInStoreCardOrders = 0;
  let totalOnlineCashOrders = 0;
  let totalOnlineCardOrders = 0;
  let totalDineInCustomers = 0;
  let totalDiscountAmount = 0;

  for (const o of liveOrders) {
    const total = orderTotal(o);
    const methodLines = o.payments?.length ? o.payments : o.paymentMethod ? [{ method: o.paymentMethod, amount: total }] : [];
    const isOnline = o.placedVia !== "staff";
    let orderHasCash = false;
    let orderHasCard = false;
    for (const line of methodLines) {
      if (line.method === "Cash") {
        totalCashAmount += line.amount;
        orderHasCash = true;
      } else {
        totalCardAmount += line.amount;
        orderHasCard = true;
        if (isOnline) totalOnlineCardAmount += line.amount;
      }
    }
    if (isOnline) {
      if (orderHasCash) totalOnlineCashOrders += 1;
      if (orderHasCard) totalOnlineCardOrders += 1;
    } else {
      if (orderHasCash) totalInStoreCashOrders += 1;
      if (orderHasCard) totalInStoreCardOrders += 1;
    }
    if (o.channel === "Dine in") totalDineInCustomers += o.guests ?? 0;
    totalDiscountAmount += (o.extraDiscount ?? 0) + (o.couponDiscount ?? 0);
  }

  const totalInStoreOrders = liveOrders.filter((o) => o.placedVia === "staff").length;
  const totalOnlineOrders = liveOrders.filter((o) => o.placedVia !== "staff").length;

  const pettyCashIn = dayPettyCash.filter((p) => p.direction === "in").reduce((sum, p) => sum + p.amount, 0);
  const pettyCashOut = dayPettyCash.filter((p) => p.direction === "out").reduce((sum, p) => sum + p.amount, 0);
  const totalPettyCash = pettyCashIn - pettyCashOut;

  const openingBalance = 0;
  const totalCashPresent = openingBalance + totalCashAmount + totalPettyCash;
  const totalAmount = totalCashAmount + totalCardAmount;
  const closingBalance = totalCashPresent;

  return {
    date: dateStr,
    ordersList,
    ordersSum,
    pettyCash: dayPettyCash,
    cancelledOrders,
    saleItems,
    detail: {
      openingBalance,
      totalBookings: dayReservations.length,
      totalGuests: dayReservations.reduce((sum, r) => sum + (r.guests ?? 0), 0),
      totalDineInCustomers,
      totalInStoreCashOrders,
      totalInStoreCardOrders,
      totalInStoreOrders,
      totalOnlineCashOrders,
      totalOnlineCardOrders,
      totalOnlineOrders,
      totalCashAmount,
      totalPettyCash,
      totalCashPresent,
      totalCardAmount,
      totalOnlineCardAmount,
      totalAmount,
      totalDiscountAmount,
      closingBalance,
    },
  };
}
