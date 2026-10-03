import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/scope";
import { getReportData, getDailySummary, getWeeklySummary } from "@/lib/data/reports";
import { getRestaurant } from "@/lib/data/restaurants";
import { listOrders } from "@/lib/data/orders";
import { listReservations } from "@/lib/data/tables";
import { listPettyCashEntries } from "@/lib/data/petty-cash";
import { listPaymentTerminals } from "@/lib/data/printers";
import { filterOrdersForAccountsRole } from "@/lib/accounts-filter";
import { businessDateKey, businessDayRange, shiftDateKey } from "@/lib/business-day";
import { ReportsClient, type ReportsSearchParams } from "./reports-client";

// Today's business-day key, as of whenever this is called — a tiny top-level wrapper around
// Date.now() (rather than calling it directly in the page component below) keeps the page
// function itself free of impure calls, per the project's react-hooks purity lint rule.
function currentBusinessDateKey(openTime: string | null, timezone: string) {
  return businessDateKey(Date.now(), openTime, timezone);
}

// `from`/`to` are inclusive business-day keys (YYYY-MM-DD, see lib/business-day.ts); resolved to
// UTC timestamps spanning those business days (not plain UTC midnight) with `to` made exclusive
// here so every query downstream just does a plain gte/lt range check.
function resolveRange(params: ReportsSearchParams, openTime: string | null, timezone: string) {
  const toStr = params.to || currentBusinessDateKey(openTime, timezone);
  const fromStr = params.from || shiftDateKey(toStr, -29);
  const from = businessDayRange(fromStr, openTime, timezone).from;
  const to = businessDayRange(toStr, openTime, timezone).to;
  return { fromStr, toStr, from, to };
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<ReportsSearchParams> }) {
  const params = await searchParams;
  const { session, restaurantId } = await requirePermission("reports");

  const restaurant = await getRestaurant(restaurantId);
  const businessDay = { openTime: restaurant?.openTime ?? null, timezone: restaurant?.timezone ?? "UTC" };
  const todayKey = currentBusinessDateKey(businessDay.openTime, businessDay.timezone);

  const tab = params.tab ?? "overview";
  const { fromStr, toStr, from, to } = resolveRange(params, businessDay.openTime, businessDay.timezone);
  const dateStr = params.date || todayKey;
  // Default week view is the 7 business days ending today.
  const weekStr = params.week || shiftDateKey(todayKey, -6);

  const paymentTerminals = await listPaymentTerminals(restaurantId);
  const accountsFilter =
    session.role === "accounts" ? { defaultTerminalName: paymentTerminals.find((t) => t.isDefault)?.name ?? null } : undefined;

  const [report, rawOrders, allReservations, pettyCash, dailySummary, weeklySummary] = await Promise.all([
    getReportData(restaurantId, { from, to }, accountsFilter, businessDay),
    listOrders(restaurantId),
    listReservations(restaurantId),
    listPettyCashEntries(restaurantId, from, to),
    tab === "daily" ? getDailySummary(restaurantId, dateStr, accountsFilter, businessDay) : Promise.resolve(null),
    tab === "weekly" ? getWeeklySummary(restaurantId, weekStr, accountsFilter, businessDay) : Promise.resolve(null),
  ]);
  const currencySymbol = restaurant?.currencySymbol ?? "£";

  const allOrders = accountsFilter ? filterOrdersForAccountsRole(rawOrders, accountsFilter.defaultTerminalName) : rawOrders;
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
          weeklySummary={weeklySummary}
          weekStr={weekStr}
          openTime={businessDay.openTime}
          timezone={businessDay.timezone}
        />
      </div>
    </AppShell>
  );
}
