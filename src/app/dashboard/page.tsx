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
import { formatMoney, formatOrderTimestamp } from "@/lib/types";
import { DashboardCharts } from "./dashboard-charts";
import { EndShiftButton } from "./end-shift-button";
import { OpenTillButton } from "./open-till-button";
import { AutoVoidNotice } from "./auto-void-notice";
import { AUTO_VOID_REASON } from "@/lib/order-helpers";
import { DollarSign, ClipboardList, Table2, Users, TrendingUp, TrendingDown, Receipt, FileText, AlertTriangle } from "lucide-react";

export default async function DashboardPage() {
  const { session, restaurantId } = await requirePermission("dashboard");
  const [orders, tables, reservations, restaurant, report, shifts, lowStockItems, paymentTerminals, permissions] = await Promise.all([
    listOrders(restaurantId),
    listTables(restaurantId),
    listReservations(restaurantId),
    getRestaurant(restaurantId),
    getReportData(restaurantId),
    listShifts(restaurantId),
    listLowStockItems(restaurantId),
    listPaymentTerminals(restaurantId),
    session.role === "staff" ? getUserPermissions(session.userId) : Promise.resolve(null),
  ]);
  const currencySymbol = restaurant?.currencySymbol ?? "£";
  const canEndDay = hasPermission(session.role, permissions, "end-day");

  const revenue = orders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.price * i.qty, 0), 0);
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
  const activeOrders = orders.filter((o) => o.status !== "Voided");
  const pendingOrders = activeOrders.filter((o) => !isOrderClosedOut(o));
  const billedOrders = activeOrders.filter(isOrderClosedOut);

  const dismissedAt = restaurant?.autoVoidNoticeDismissedAt ?? 0;
  const carriedOverOrders = orders
    .filter((o) => o.voidReason === AUTO_VOID_REASON && (o.voidedAt ?? 0) > dismissedAt)
    .sort((a, b) => b.createdAt - a.createdAt);

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

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={DollarSign} label="Today's Revenue" value={formatMoney(revenue, currencySymbol)} tint="bg-teal-50 text-teal-600" />
          <StatCard icon={ClipboardList} label="Active Orders" value={String(orders.length)} tint="bg-amber-50 text-amber-600" />
          <StatCard icon={Table2} label="Tables Occupied" value={`${onDine}/${tables.length}`} tint="bg-rose-50 text-rose-600" />
          <StatCard icon={Users} label="Reservations Today" value={String(reservations.length)} tint="bg-indigo-50 text-indigo-600" />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-neutral-900">Top Selling Dishes</h2>
            <div className="space-y-3">
              {topDishes.length === 0 && <p className="text-sm text-neutral-400">No orders yet.</p>}
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
              {orders.length === 0 && <p className="text-sm text-neutral-400">No orders yet.</p>}
              {orders.slice(0, 5).map((o) => (
                <div key={o.id} className="flex items-center justify-between text-sm">
                  <span className="text-neutral-700">
                    Order #{o.orderNumber} · Table {o.tableNumber ?? "-"}
                  </span>
                  <span className="font-semibold text-neutral-900">{o.status}</span>
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
                    #{o.orderNumber} · Table {o.tableNumber ?? "-"}
                  </span>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">{o.status}</span>
                </div>
              ))}
              {pendingOrders.length === 0 && <p className="text-sm text-neutral-400">Nothing pending right now.</p>}
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

        <h2 className="mb-4 mt-8 text-base font-semibold text-neutral-900">Reports & Insights</h2>
        <DashboardCharts report={report} currencySymbol={currencySymbol} />

        {shifts.length > 0 && (
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
        )}
      </div>
    </AppShell>
  );
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
    <div className="flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-5">
      <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${tint}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-xs text-neutral-400">{label}</div>
        <div className="text-lg font-semibold text-neutral-900">{value}</div>
      </div>
    </div>
  );
}
