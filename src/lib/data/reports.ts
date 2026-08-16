import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, reservations } from "@/db/schema";
import { orderTotal } from "@/lib/types";

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

  for (const o of liveOrders) {
    const total = orderTotal(o);
    if (o.paymentMethod === "Cash") cashSales += total;
    else if (o.paymentMethod === "Card") cardSales += total;
    else otherSales += total;

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
  };
}
