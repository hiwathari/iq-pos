import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getUserPermissions, requirePermission } from "@/lib/scope";
import { hasPermission } from "@/lib/permissions";
import { listTables, listReservations } from "@/lib/data/tables";
import { listOrders } from "@/lib/data/orders";
import { getRestaurant } from "@/lib/data/restaurants";
import { listPaymentTerminals } from "@/lib/data/printers";
import { getReportData } from "@/lib/data/reports";
import { listShifts } from "@/lib/data/shifts";
import { listLowStockItems } from "@/lib/data/inventory";
import { filterOrdersForAccountsRole } from "@/lib/accounts-filter";
import { businessDateKey, businessDayRange, shiftDateKey } from "@/lib/business-day";
import { formatMoney, formatOrderTimestamp, orderTotal, type Order } from "@/lib/types";
import { DashboardCharts } from "./dashboard-charts";
import { EndShiftButton } from "./end-shift-button";
import { OpenTillButton } from "./open-till-button";
import { AutoVoidNotice } from "./auto-void-notice";
import { AUTO_VOID_REASON } from "@/lib/order-helpers";
import {
  DollarSign,
  ClipboardList,
  CheckCircle2,
  Table2,
  Users,
  TrendingUp,
  TrendingDown,
  Receipt,
  FileText,
  AlertTriangle,
  CreditCard,
  Wallet,
  Banknote,
  PiggyBank,
  BarChart3,
} from "lucide-react";

// A tiny top-level wrapper around Date.now() (rather than calling it directly in the page
// component below) keeps the component itself free of impure calls, per the project's
// react-hooks purity lint rule.
function currentBusinessDateKey(openTime: string | null, timezone: string) {
  return businessDateKey(Date.now(), openTime, timezone);
}

function sumLiveSales(orders: Order[], from: number, to: number) {
  return orders.filter((o) => o.status !== "Voided" && o.createdAt >= from && o.createdAt < to).reduce((sum, o) => sum + orderTotal(o), 0);
}

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null; // no baseline to compare against
  return ((current - previous) / previous) * 100;
}

export default async function DashboardPage() {
  const { session, restaurantId } = await requirePermission("dashboard");
  const [rawOrders, tables, rawReservations, restaurant, shifts, lowStockItems, paymentTerminals, permissions] = await Promise.all([
    listOrders(restaurantId),
    listTables(restaurantId),
    listReservations(restaurantId),
    getRestaurant(restaurantId),
    listShifts(restaurantId),
    listLowStockItems(restaurantId),
    listPaymentTerminals(restaurantId),
    session.role === "staff" ? getUserPermissions(session.userId) : Promise.resolve(null),
  ]);
  const currencySymbol = restaurant?.currencySymbol ?? "£";
  const canEndDay = hasPermission(session.role, permissions, "end-day");
  const businessDay = { openTime: restaurant?.openTime ?? null, timezone: restaurant?.timezone ?? "UTC" };

  // The "accounts" login (see lib/accounts-filter.ts) only ever sees cash + the default payment
  // terminal in full, with every other terminal limited to its last 14 days — applied once here
  // so every stat below (and the charts, via getReportData) is already working from the same
  // restricted set rather than each one re-deriving it.
  const defaultTerminalName = paymentTerminals.find((t) => t.isDefault)?.name ?? null;
  const allOrders = session.role === "accounts" ? filterOrdersForAccountsRole(rawOrders, defaultTerminalName) : rawOrders;
  // The Trends/Channel/Category charts further down intentionally look across all of history
  // (that's the whole point of a trend) — only the stat boxes right below are scoped to today.
  const report = await getReportData(
    restaurantId,
    undefined,
    session.role === "accounts" ? { defaultTerminalName } : undefined,
    businessDay
  );

  const todayKey = currentBusinessDateKey(businessDay.openTime, businessDay.timezone);
  const yesterdayKey = shiftDateKey(todayKey, -1);
  const todayRange = businessDayRange(todayKey, businessDay.openTime, businessDay.timezone);
  const yesterdayRange = businessDayRange(yesterdayKey, businessDay.openTime, businessDay.timezone);

  const orders = allOrders.filter((o) => o.createdAt >= todayRange.from && o.createdAt < todayRange.to);
  const reservations = rawReservations.filter((r) => r.date === todayKey);
  const onDine = tables.filter((t) => t.status === "on-dine").length;

  const topDishesMap = new Map<string, { name: string; qty: number }>();
  for (const o of orders) {
    for (const i of o.items) {
      const existing = topDishesMap.get(i.name);
      topDishesMap.set(i.name, { name: i.name, qty: (existing?.qty ?? 0) + i.qty });
    }
  }
  const topDishes = [...topDishesMap.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);

  const totalQtySold = report.itemWiseSoldQty.reduce((sum, i) => sum + i.qty, 0);
  const mostSold = report.itemWiseSoldQty.slice(0, 3);
  const leastSold = [...report.itemWiseSoldQty].sort((a, b) => a.qty - b.qty).slice(0, 3);

  const isOrderClosedOut = (o: (typeof orders)[number]) => o.status === "Served" && !!o.paymentMethod;
  const liveOrders = orders.filter((o) => o.status !== "Voided");
  // "Active"/"Finished" is about kitchen progress (still cooking vs served); "Pending"/"Billed"
  // just below is about payment instead — a finished, served order can still be unpaid.
  const activeOrders = liveOrders.filter((o) => o.status === "Wait List" || o.status === "In Kitchen");
  const finishedOrders = liveOrders.filter((o) => o.status === "Served");
  const pendingOrders = liveOrders.filter((o) => !isOrderClosedOut(o));
  const billedOrders = liveOrders.filter(isOrderClosedOut);

  // Cash/card split for today, plus a named breakdown per payment terminal — same payment-line
  // splitting logic used everywhere else (summarizeShiftWindow, getReportData).
  let cashSales = 0;
  let cardSales = 0;
  const byTerminal = new Map<string, number>();
  for (const o of liveOrders) {
    const total = orderTotal(o);
    const methodLines = o.payments?.length ? o.payments : o.paymentMethod ? [{ method: o.paymentMethod, amount: total }] : [];
    for (const line of methodLines) {
      if (line.method === "Cash") cashSales += line.amount;
      else {
        cardSales += line.amount;
        byTerminal.set(line.method, (byTerminal.get(line.method) ?? 0) + line.amount);
      }
    }
  }
  // Best estimate of what's actually in the drawer right now: the float declared at Open Till,
  // plus today's cash sales. There's no live cash-expense tracking (only at End Day), so this
  // doesn't account for any cash taken out of the till during the day.
  const cashAtTill = (restaurant?.pendingOpeningBalance ?? 0) + cashSales;

  // Daily/weekly/monthly comparisons — computed from the same already-loaded order history
  // rather than extra DB round trips, since listOrders already returns every order ever placed.
  const todaySales = sumLiveSales(allOrders, todayRange.from, todayRange.to);
  const yesterdaySales = sumLiveSales(allOrders, yesterdayRange.from, yesterdayRange.to);
  const thisWeekStart = businessDayRange(shiftDateKey(todayKey, -6), businessDay.openTime, businessDay.timezone).from;
  const lastWeekStart = businessDayRange(shiftDateKey(todayKey, -13), businessDay.openTime, businessDay.timezone).from;
  const thisWeekSales = sumLiveSales(allOrders, thisWeekStart, todayRange.to);
  const lastWeekSales = sumLiveSales(allOrders, lastWeekStart, thisWeekStart);
  const thisMonthStart = businessDayRange(shiftDateKey(todayKey, -29), businessDay.openTime, businessDay.timezone).from;
  const lastMonthStart = businessDayRange(shiftDateKey(todayKey, -59), businessDay.openTime, businessDay.timezone).from;
  const thisMonthSales = sumLiveSales(allOrders, thisMonthStart, todayRange.to);
  const lastMonthSales = sumLiveSales(allOrders, lastMonthStart, thisMonthStart);

  const dismissedAt = restaurant?.autoVoidNoticeDismissedAt ?? 0;
  const carriedOverOrders = allOrders
    .filter((o) => o.voidReason === AUTO_VOID_REASON && (o.voidedAt ?? 0) > dismissedAt)
    .sort((a, b) => b.createdAt - a.createdAt);

  // A staff login gets its own shift history instead of the full restaurant-wide table below:
  // their own close today and yesterday (if any), plus a couple of other people's recent closes
  // for context on a handover. Admin/accounts keep the full table further down.
  const myShiftsToday = shifts.filter(
    (s) => s.closedByUserId === session.userId && s.closedAt >= todayRange.from && s.closedAt < todayRange.to
  );
  const myShiftsYesterday = shifts.filter(
    (s) => s.closedByUserId === session.userId && s.closedAt >= yesterdayRange.from && s.closedAt < yesterdayRange.to
  );
  const othersRecentShifts = shifts.filter((s) => s.closedByUserId !== session.userId).slice(0, 2);

  return (
    <AppShell title="Dashboard">
      <div className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-neutral-900">Dashboard</h1>
          {canEndDay && (
            <div className="flex items-center gap-2">
              <OpenTillButton
                currencySymbol={currencySymbol}
                pendingOpeningBalance={restaurant?.pendingOpeningBalance ?? null}
                openingBalanceSetByName={restaurant?.openingBalanceSetByName ?? null}
              />
              <EndShiftButton currencySymbol={currencySymbol} terminalNames={paymentTerminals.filter((t) => t.active).map((t) => t.name)} />
            </div>
          )}
        </div>

        <AutoVoidNotice orders={carriedOverOrders} />

        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard icon={DollarSign} label="Today's Sale" value={formatMoney(todaySales, currencySymbol)} tint="bg-teal-50 text-teal-600" />
          <StatCard icon={ClipboardList} label="Active Orders" value={String(activeOrders.length)} tint="bg-amber-50 text-amber-600" />
          <StatCard icon={CheckCircle2} label="Finished Orders" value={String(finishedOrders.length)} tint="bg-emerald-50 text-emerald-600" />
          <StatCard icon={Table2} label="Tables Occupied" value={`${onDine}/${tables.length}`} tint="bg-rose-50 text-rose-600" />
          <StatCard icon={Users} label="Reservations Today" value={String(reservations.length)} tint="bg-indigo-50 text-indigo-600" />
          <StatCard icon={CreditCard} label="Card Sales Today" value={formatMoney(cardSales, currencySymbol)} tint="bg-sky-50 text-sky-600" />
          <StatCard icon={Banknote} label="Cash Sales Today" value={formatMoney(cashSales, currencySymbol)} tint="bg-lime-50 text-lime-600" />
          <StatCard icon={PiggyBank} label="Cash in Till" value={formatMoney(cashAtTill, currencySymbol)} tint="bg-orange-50 text-orange-600" />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-neutral-900">Top Selling Dishes</h2>
            <div className="space-y-3">
              {topDishes.length === 0 && <p className="text-sm text-neutral-400">No orders yet today.</p>}
              {topDishes.map((d) => (
                <div key={d.name} className="flex items-center justify-between text-sm">
                  <span className="text-neutral-700">{d.name}</span>
                  <span className="font-semibold text-neutral-900">{d.qty}x</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-neutral-900">Recent Orders</h2>
            <div className="space-y-3">
              {orders.length === 0 && <p className="text-sm text-neutral-400">No orders yet today.</p>}
              {orders.slice(0, 5).map((o) => (
                <div key={o.id} className="flex items-center justify-between text-sm">
                  <span className="text-neutral-700">
                    #{o.orderNumber} · {channelLabel(o)}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      isOrderClosedOut(o) ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {o.status === "Voided" ? "Voided" : isOrderClosedOut(o) ? "Billed" : "Pending"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-neutral-900">Popularity</h2>
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">Most Sold</div>
            <div className="mb-4 space-y-2">
              {mostSold.length === 0 && <p className="text-sm text-neutral-400">No sales yet.</p>}
              {mostSold.map((d) => (
                <div key={d.name} className="flex items-center gap-2 text-sm">
                  <TrendingUp className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  <span className="flex-1 truncate text-neutral-700">{d.name}</span>
                  <span className="font-semibold text-neutral-900">
                    {totalQtySold > 0 ? Math.round((d.qty / totalQtySold) * 100) : 0}%
                  </span>
                </div>
              ))}
            </div>
            {leastSold.length > 0 && leastSold[0].qty !== mostSold[0]?.qty && (
              <>
                <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">Least Sold</div>
                <div className="space-y-2">
                  {leastSold.map((d) => (
                    <div key={d.name} className="flex items-center gap-2 text-sm">
                      <TrendingDown className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                      <span className="flex-1 truncate text-neutral-700">{d.name}</span>
                      <span className="font-semibold text-neutral-900">
                        {totalQtySold > 0 ? Math.round((d.qty / totalQtySold) * 100) : 0}%
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-neutral-900">
              <Receipt className="h-4 w-4 text-teal-600" /> Order & Billing Status
            </h2>
            <div className="mb-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-amber-50 p-3 text-center">
                <div className="text-xl font-bold text-amber-700">{pendingOrders.length}</div>
                <div className="text-xs text-amber-600">Pending</div>
              </div>
              <div className="rounded-xl bg-emerald-50 p-3 text-center">
                <div className="text-xl font-bold text-emerald-700">{billedOrders.length}</div>
                <div className="text-xs text-emerald-600">Billed</div>
              </div>
            </div>
            <div className="space-y-2">
              {pendingOrders.slice(0, 4).map((o) => (
                <div key={o.id} className="flex items-center justify-between text-sm">
                  <span className="text-neutral-700">
                    #{o.orderNumber} · {channelLabel(o)}
                  </span>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">{o.status}</span>
                </div>
              ))}
              {pendingOrders.length === 0 && <p className="text-sm text-neutral-400">Nothing pending right now.</p>}
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-5 lg:col-span-2">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-neutral-900">
              <Wallet className="h-4 w-4 text-teal-600" /> Today&apos;s Payment Breakdown
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <div className="flex items-center gap-3 rounded-xl border border-neutral-100 p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-lime-50 text-lime-600">
                  <Banknote className="h-4.5 w-4.5" />
                </div>
                <div>
                  <div className="text-xs text-neutral-400">Cash</div>
                  <div className="text-sm font-semibold text-neutral-900">{formatMoney(cashSales, currencySymbol)}</div>
                </div>
              </div>
              {paymentTerminals
                .filter((t) => t.active)
                .map((t) => (
                  <div key={t.id} className="flex items-center gap-3 rounded-xl border border-neutral-100 p-3">
                    {t.logoUrl ? (
                      <img src={t.logoUrl} alt="" className="h-9 w-9 shrink-0 rounded-lg object-contain" />
                    ) : (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                        <CreditCard className="h-4.5 w-4.5" />
                      </div>
                    )}
                    <div>
                      <div className="text-xs text-neutral-400">{t.name}</div>
                      <div className="text-sm font-semibold text-neutral-900">
                        {formatMoney(byTerminal.get(t.name) ?? 0, currencySymbol)}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {lowStockItems.length > 0 && (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-800">
              <AlertTriangle className="h-4 w-4" /> Low Stock
            </h2>
            <div className="space-y-2">
              {lowStockItems.map((i) => (
                <div key={i.id} className="flex items-center justify-between text-sm">
                  <span className="text-amber-800">{i.name}</span>
                  <span className="font-semibold text-amber-900">
                    {i.quantity} {i.unit} left
                  </span>
                </div>
              ))}
            </div>
            {session.role !== "staff" && (
              <Link href="/inventory" className="mt-3 inline-block text-xs font-semibold text-amber-700 hover:underline">
                Manage inventory →
              </Link>
            )}
          </div>
        )}

        <h2 className="mb-4 mt-8 flex items-center gap-2 text-base font-semibold text-neutral-900">
          <BarChart3 className="h-4 w-4 text-teal-600" /> Sales Comparison
        </h2>
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <ComparisonCard label="Today vs Yesterday" current={todaySales} previous={yesterdaySales} currencySymbol={currencySymbol} />
          <ComparisonCard label="This Week vs Last Week" current={thisWeekSales} previous={lastWeekSales} currencySymbol={currencySymbol} />
          <ComparisonCard label="This Month vs Last Month" current={thisMonthSales} previous={lastMonthSales} currencySymbol={currencySymbol} />
        </div>

        <h2 className="mb-4 text-base font-semibold text-neutral-900">Reports & Insights</h2>
        <DashboardCharts report={report} currencySymbol={currencySymbol} />

        {session.role === "staff" ? (
          <>
            <h2 className="mb-4 mt-8 flex items-center gap-2 text-base font-semibold text-neutral-900">
              <FileText className="h-4 w-4 text-teal-600" /> My Shift Reports
            </h2>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">Today & Yesterday</h3>
                <MyShiftRows shifts={[...myShiftsToday, ...myShiftsYesterday]} currencySymbol={currencySymbol} emptyText="No shift closed by you yet." />
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">Recently Closed by Others</h3>
                <MyShiftRows shifts={othersRecentShifts} currencySymbol={currencySymbol} emptyText="No other closes yet." showClosedBy />
              </div>
            </div>
          </>
        ) : (
          shifts.length > 0 && (
            <>
              <h2 className="mb-4 mt-8 flex items-center gap-2 text-base font-semibold text-neutral-900">
                <FileText className="h-4 w-4 text-teal-600" /> Shift Reports
              </h2>
              <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 text-left text-xs font-medium uppercase tracking-wide text-neutral-400">
                    <tr>
                      <th className="px-5 py-3">Closed</th>
                      <th className="px-5 py-3">Closed By</th>
                      <th className="px-5 py-3 text-right">Total Sales</th>
                      <th className="px-5 py-3 text-right">Variance</th>
                      <th className="px-5 py-3 text-right">Report</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {shifts.slice(0, 10).map((s) => {
                      const variance = s.cashCounted - s.expectedCash;
                      return (
                        <tr key={s.id}>
                          <td className="px-5 py-3 text-neutral-600">{formatOrderTimestamp(s.closedAt)}</td>
                          <td className="px-5 py-3 text-neutral-600">{s.closedByName ?? "—"}</td>
                          <td className="px-5 py-3 text-right font-semibold text-neutral-900">
                            {formatMoney(s.totalSales, currencySymbol)}
                          </td>
                          <td className={`px-5 py-3 text-right font-semibold ${Math.abs(variance) < 0.01 ? "text-emerald-600" : "text-rose-600"}`}>
                            {Math.abs(variance) < 0.01 ? "Balanced" : formatMoney(variance, currencySymbol)}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <Link href={`/shift-report/${s.id}`} className="text-sm font-semibold text-teal-600 hover:underline">
                              View
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )
        )}
      </div>
    </AppShell>
  );
}

function channelLabel(o: Order) {
  if (o.channel === "Dine in") return `Table ${o.tableNumber ?? "-"}`;
  if (o.channel === "Take Away") return "Takeaway";
  if (o.channel === "Third Party" && o.thirdPartyProvider) return o.thirdPartyProvider;
  return o.channel;
}

function StatCard({
  icon: Icon,
  label,
  value,
  tint,
}: {
  icon: typeof DollarSign;
  label: string;
  value: string;
  tint: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tint}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs text-neutral-400">{label}</div>
        <div className="truncate text-base font-semibold text-neutral-900">{value}</div>
      </div>
    </div>
  );
}

function ComparisonCard({
  label,
  current,
  previous,
  currencySymbol,
}: {
  label: string;
  current: number;
  previous: number;
  currencySymbol: string;
}) {
  const change = percentChange(current, previous);
  const diff = current - previous;
  const isUp = diff >= 0;
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">{label}</div>
      <div className="mb-2 text-xl font-bold text-neutral-900">{formatMoney(current, currencySymbol)}</div>
      <div className={`flex items-center gap-1.5 text-sm font-semibold ${isUp ? "text-emerald-600" : "text-rose-600"}`}>
        {isUp ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
        <span>
          {isUp ? "+" : "-"}
          {formatMoney(Math.abs(diff), currencySymbol)}
          {change !== null && ` (${isUp ? "+" : ""}${change.toFixed(1)}%)`}
        </span>
        <span className="font-normal text-neutral-400">vs {formatMoney(previous, currencySymbol)}</span>
      </div>
    </div>
  );
}

function MyShiftRows({
  shifts,
  currencySymbol,
  emptyText,
  showClosedBy,
}: {
  shifts: { id: string; closedAt: number; closedByName: string | null; totalSales: number; cashCounted: number; expectedCash: number }[];
  currencySymbol: string;
  emptyText: string;
  showClosedBy?: boolean;
}) {
  if (shifts.length === 0) return <p className="text-sm text-neutral-400">{emptyText}</p>;
  return (
    <div className="space-y-2">
      {shifts.map((s) => {
        const variance = s.cashCounted - s.expectedCash;
        return (
          <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-100 px-3.5 py-2.5 text-sm">
            <div className="min-w-0">
              <div className="truncate text-neutral-700">{formatOrderTimestamp(s.closedAt)}</div>
              {showClosedBy && <div className="truncate text-xs text-neutral-400">{s.closedByName ?? "—"}</div>}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="font-semibold text-neutral-900">{formatMoney(s.totalSales, currencySymbol)}</span>
              <span className={`text-xs font-semibold ${Math.abs(variance) < 0.01 ? "text-emerald-600" : "text-rose-600"}`}>
                {Math.abs(variance) < 0.01 ? "Balanced" : formatMoney(variance, currencySymbol)}
              </span>
              <Link href={`/shift-report/${s.id}`} className="text-xs font-semibold text-teal-600 hover:underline">
                View
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
