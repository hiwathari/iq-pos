import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { categories, dishes, orders, reservations } from "@/db/schema";
import { orderTotal } from "@/lib/types";

export type ReportData = Awaited<ReturnType<typeof getReportData>>;

export async function getReportData(restaurantId: string) {
  const [allOrders, allReservations, allDishes, allCategories] = await Promise.all([
    db.select().from(orders).where(eq(orders.restaurantId, restaurantId)),
    db.select().from(reservations).where(eq(reservations.restaurantId, restaurantId)),
    db.select().from(dishes).where(eq(dishes.restaurantId, restaurantId)),
    db.select().from(categories).where(eq(categories.restaurantId, restaurantId)),
  ]);

  const categoryNameById = new Map(allCategories.map((c) => [c.id, c.name]));
  const categoryNameByDishId = new Map(allDishes.map((d) => [d.id, categoryNameById.get(d.categoryId) ?? "Other"]));

  const liveOrders = allOrders.filter((o) => o.status !== "Voided");
  const voidedOrders = allOrders.filter((o) => o.status === "Voided");

  let cashSales = 0;
  let cardSales = 0;
  let otherSales = 0;
  let totalGuests = 0;
  let totalTax = 0;
  let totalDonations = 0;
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
    totalTax += subtotal * 0.06;
    totalDonations += o.donation ?? 0;

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
    totalDonations,
  };
}
