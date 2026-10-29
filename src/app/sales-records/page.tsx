import { and, desc, eq, gte, lt } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { db } from "@/db/client";
import { orders } from "@/db/schema";
import { businessDateKey, businessDayRange } from "@/lib/business-day";
import { listPaymentTerminals } from "@/lib/data/printers";
import { getRestaurant } from "@/lib/data/restaurants";
import { listShifts } from "@/lib/data/shifts";
import { requirePermission } from "@/lib/scope";
import { SalesRecordsClient } from "./sales-records-client";

// A top-level wrapper keeps Date.now() out of the component body (react-hooks purity rule).
function todayKey(openTime: string | null, timezone: string) {
  return businessDateKey(Date.now(), openTime, timezone);
}

// Sales Records — the admin's table view of the "final" entries: every End Day report, and each
// business day's orders, with edit and permanent delete (lib/actions/sales-records.ts).
export default async function SalesRecordsPage({ searchParams }: PageProps<"/sales-records">) {
  const { restaurantId } = await requirePermission("sales-records");
  const params = await searchParams;
  const restaurant = await getRestaurant(restaurantId);
  const openTime = restaurant?.openTime ?? null;
  const timezone = restaurant?.timezone ?? "UTC";
  const today = todayKey(openTime, timezone);
  const date = typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;
  const tab = params.tab === "orders" ? "orders" : "reports";
  const { from, to } = businessDayRange(date, openTime, timezone);

  const [shiftRows, dayOrders, terminals] = await Promise.all([
    listShifts(restaurantId),
    db
      .select()
      .from(orders)
      .where(and(eq(orders.restaurantId, restaurantId), gte(orders.createdAt, from), lt(orders.createdAt, to)))
      .orderBy(desc(orders.createdAt)),
    listPaymentTerminals(restaurantId),
  ]);

  return (
    <AppShell title="Sales Records">
      <SalesRecordsClient
        tab={tab}
        date={date}
        today={today}
        shifts={shiftRows}
        orders={dayOrders}
        paymentMethods={["Cash", ...terminals.map((t) => t.name)]}
        currencySymbol={restaurant?.currencySymbol ?? "£"}
      />
    </AppShell>
  );
}
