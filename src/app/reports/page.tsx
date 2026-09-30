import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/scope";
import { getReportData, getDailySummary } from "@/lib/data/reports";
import { getRestaurant } from "@/lib/data/restaurants";
import { listOrders } from "@/lib/data/orders";
import { listReservations } from "@/lib/data/tables";
import { listPettyCashEntries } from "@/lib/data/petty-cash";
import { ReportsClient, type ReportsSearchParams } from "./reports-client";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// `from`/`to` are inclusive calendar dates (YYYY-MM-DD); resolved to UTC-midnight timestamps with
// `to` made exclusive here so every query downstream just does a plain gte/lt range check.
function resolveRange(params: ReportsSearchParams) {
  const toStr = params.to || todayStr();
  const fromStr = params.from || new Date(Date.parse(`${toStr}T00:00:00.000Z`) - 29 * 86400000).toISOString().slice(0, 10);
  const from = Date.parse(`${fromStr}T00:00:00.000Z`);
  const to = Date.parse(`${toStr}T00:00:00.000Z`) + 86400000;
  return { fromStr, toStr, from, to };
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<ReportsSearchParams> }) {
  const params = await searchParams;
  const { restaurantId } = await requirePermission("reports");

  const tab = params.tab ?? "overview";
  const { fromStr, toStr, from, to } = resolveRange(params);
  const dateStr = params.date || todayStr();

  const [report, restaurant, allOrders, allReservations, pettyCash, dailySummary] = await Promise.all([
    getReportData(restaurantId, { from, to }),
    getRestaurant(restaurantId),
    listOrders(restaurantId),
    listReservations(restaurantId),
    listPettyCashEntries(restaurantId, from, to),
    tab === "daily" ? getDailySummary(restaurantId, dateStr) : Promise.resolve(null),
  ]);
  const currencySymbol = restaurant?.currencySymbol ?? "£";

  const ordersInRange = allOrders.filter((o) => o.createdAt >= from && o.createdAt < to);
  const reservationsInRange = allReservations.filter((r) => r.createdAt >= from && r.createdAt < to);

  return (
    <AppShell title="Reports">
      <div className="p-6 print:p-0">
        <h1 className="mb-6 text-xl font-semibold text-neutral-900 print:mb-4">Reports</h1>
        <ReportsClient
          tab={tab}
          fromStr={fromStr}
          toStr={toStr}
          dateStr={dateStr}
          report={report}
          currencySymbol={currencySymbol}
          ordersInRange={ordersInRange}
          reservationsInRange={reservationsInRange}
          pettyCash={pettyCash}
          dailySummary={dailySummary}
        />
      </div>
    </AppShell>
  );
}
