import { AppShell } from "@/components/app-shell";
import { assertAdmin, requireRestaurantContext } from "@/lib/scope";
import { getReportData } from "@/lib/data/reports";
import { Users, Package, Wallet, CreditCard, QrCode, DollarSign, Ban } from "lucide-react";

export default async function ReportsPage() {
  const { session, restaurantId } = await requireRestaurantContext();
  assertAdmin(session);
  const report = await getReportData(restaurantId);

  return (
    <AppShell title="Reports">
      <div className="p-6">
        <h1 className="mb-6 text-xl font-semibold text-neutral-900">Reports</h1>

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Users} label="Total Customers" value={String(report.totalCustomers)} tint="bg-indigo-50 text-indigo-600" />
          <StatCard icon={DollarSign} label="Total Sales" value={`$${report.totalSales.toFixed(2)}`} tint="bg-teal-50 text-teal-600" />
          <StatCard icon={Wallet} label="Cash Sales" value={`$${report.cashSales.toFixed(2)}`} tint="bg-emerald-50 text-emerald-600" />
          <StatCard icon={CreditCard} label="Card Sales" value={`$${report.cardSales.toFixed(2)}`} tint="bg-blue-50 text-blue-600" />
          <StatCard icon={QrCode} label="Other Sales" value={`$${report.otherSales.toFixed(2)}`} tint="bg-amber-50 text-amber-600" />
          <StatCard
            icon={Ban}
            label="Void Order Amount"
            value={`$${report.voidOrderAmount.toFixed(2)}`}
            sub={`${report.voidOrderCount} voided order${report.voidOrderCount === 1 ? "" : "s"}`}
            tint="bg-rose-50 text-rose-600"
          />
          <StatCard icon={Package} label="Orders Counted" value={String(report.orderCount)} tint="bg-neutral-100 text-neutral-600" />
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-neutral-900">Item-wise Sold Quantity</h2>
          {report.itemWiseSoldQty.length === 0 ? (
            <p className="text-sm text-neutral-400">No sales recorded yet.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-neutral-100">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-left text-xs font-medium uppercase tracking-wide text-neutral-400">
                  <tr>
                    <th className="px-4 py-2.5">Item</th>
                    <th className="px-4 py-2.5 text-right">Qty Sold</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {report.itemWiseSoldQty.map((item) => (
                    <tr key={item.name}>
                      <td className="px-4 py-2.5 text-neutral-700">{item.name}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-neutral-900">{item.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tint,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  sub?: string;
  tint: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-5">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tint}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-xs text-neutral-400">{label}</div>
        <div className="text-lg font-semibold text-neutral-900">{value}</div>
        {sub && <div className="text-xs text-neutral-400">{sub}</div>}
      </div>
    </div>
  );
}
