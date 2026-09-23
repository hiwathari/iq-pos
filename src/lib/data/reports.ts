import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, reservations } from "@/db/schema";
import { orderTotal } from "@/lib/types";

export type ReportData = Awaited<ReturnType<typeof getReportData>>;

export async function getReportData(restaurantId: string) {
  const [allOrders, allReservations] = await Promise.all([
    db.select().from(orders).where(eq(orders.restaurantId, restaurantId)),
    db.select().from(reservations).where(eq(reservations.restaurantId, restaurantId)),
  ]);

  const liveOrders = allOrders.filter((o) => o.status !== "Voided");
  const voidedOrders = allOrders.filter((o) => o.status === "Voided");

  let cashSales = 0;
  let cardSales = 0;
  let otherSales = 0;
  const itemQty = new Map<string, number>();
  const channelMap = new Map<string, { revenue: number; count: number }>();
  const paymentMethodMap = new Map<string, number>();
  const staffMap = new Map<string, { revenue: number; count: number }>();

  const bump = (map: Map<string, { revenue: number; count: number }>, key: string, amount: number) => {
    const existing = map.get(key) ?? { revenue: 0, count: 0 };
    existing.revenue += amount;
    existing.count += 1;
    map.set(key, existing);
  };

  for (const o of liveOrders) {
    const total = orderTotal(o);

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

    for (const item of o.items) {
      itemQty.set(item.name, (itemQty.get(item.name) ?? 0) + item.qty);
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

  const byChannel = [...channelMap.entries()]
    .map(([channel, v]) => ({ channel, ...v }))
    .sort((a, b) => b.revenue - a.revenue);

  const byPaymentMethod = [...paymentMethodMap.entries()]
    .map(([method, revenue]) => ({ method, revenue }))
    .sort((a, b) => b.revenue - a.revenue);

  const byStaff = [...staffMap.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    totalCustomers: customerNames.size,
    itemWiseSoldQty,
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
  };
}
