"use client";

import { useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { DollarSign, ClipboardList, Table2, Users } from "lucide-react";

export default function DashboardPage() {
  const { orders, tables, reservations } = useStore();

  const stats = useMemo(() => {
    const revenue = orders.reduce(
      (sum, o) => sum + o.items.reduce((s, i) => s + i.price * i.qty, 0) + (o.donation ?? 0),
      0
    );
    const onDine = tables.filter((t) => t.status === "on-dine").length;
    return {
      revenue,
      orderCount: orders.length,
      onDine,
      tableCount: tables.length,
      reservationCount: reservations.length,
    };
  }, [orders, tables, reservations]);

  const topDishes = useMemo(() => {
    const map = new Map<string, { name: string; qty: number }>();
    for (const o of orders) {
      for (const i of o.items) {
        const existing = map.get(i.name);
        map.set(i.name, { name: i.name, qty: (existing?.qty ?? 0) + i.qty });
      }
    }
    return [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);
  }, [orders]);

  return (
    <AppShell title="Dashboard">
      <div className="p-6">
        <h1 className="mb-6 text-xl font-semibold text-neutral-900">Dashboard</h1>

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={DollarSign} label="Today's Revenue" value={`$${stats.revenue.toFixed(2)}`} tint="bg-teal-50 text-teal-600" />
          <StatCard icon={ClipboardList} label="Active Orders" value={String(stats.orderCount)} tint="bg-amber-50 text-amber-600" />
          <StatCard icon={Table2} label="Tables Occupied" value={`${stats.onDine}/${stats.tableCount}`} tint="bg-rose-50 text-rose-600" />
          <StatCard icon={Users} label="Reservations Today" value={String(stats.reservationCount)} tint="bg-indigo-50 text-indigo-600" />
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
        </div>
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
