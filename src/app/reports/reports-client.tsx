"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/types";
import type { ReportData } from "@/lib/data/reports";
import { RevenueBarChart, RevenueLineChart, RevenuePieChart } from "@/components/charts";
import {
  Users,
  Package,
  Wallet,
  CreditCard,
  QrCode,
  DollarSign,
  Ban,
  LayoutGrid,
  UserCircle,
  Receipt,
  PiggyBank,
  TrendingUp,
  Utensils,
  Tag,
} from "lucide-react";

const TABS = ["Overview", "Trends", "By Channel", "By Payment Method", "By Category", "By Staff"] as const;
type Tab = (typeof TABS)[number];

export function ReportsClient({ report, currencySymbol }: { report: ReportData; currencySymbol: string }) {
  const [tab, setTab] = useState<Tab>("Overview");

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-white p-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              tab === t ? "bg-teal-600 text-white" : "text-neutral-500 hover:bg-neutral-50"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && <OverviewTab report={report} currencySymbol={currencySymbol} />}
      {tab === "Trends" && <TrendsTab report={report} currencySymbol={currencySymbol} />}
      {tab === "By Channel" && <ChannelTab report={report} currencySymbol={currencySymbol} />}
      {tab === "By Payment Method" && <PaymentMethodTab report={report} currencySymbol={currencySymbol} />}
      {tab === "By Category" && <CategoryTab report={report} currencySymbol={currencySymbol} />}
      {tab === "By Staff" && <StaffTab report={report} currencySymbol={currencySymbol} />}
    </div>
  );
}

function OverviewTab({ report, currencySymbol }: { report: ReportData; currencySymbol: string }) {
  return (
    <>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label="Total Customers" value={String(report.totalCustomers)} tint="bg-indigo-50 text-indigo-600" />
        <StatCard icon={DollarSign} label="Total Sales" value={formatMoney(report.totalSales, currencySymbol)} tint="bg-teal-50 text-teal-600" />
        <StatCard icon={Wallet} label="Cash Sales" value={formatMoney(report.cashSales, currencySymbol)} tint="bg-emerald-50 text-emerald-600" />
        <StatCard icon={CreditCard} label="Card Sales" value={formatMoney(report.cardSales, currencySymbol)} tint="bg-blue-50 text-blue-600" />
        <StatCard icon={QrCode} label="Other Sales" value={formatMoney(report.otherSales, currencySymbol)} tint="bg-amber-50 text-amber-600" />
        <StatCard
          icon={Ban}
          label="Void Order Amount"
          value={formatMoney(report.voidOrderAmount, currencySymbol)}
          sub={`${report.voidOrderCount} voided order${report.voidOrderCount === 1 ? "" : "s"}`}
          tint="bg-rose-50 text-rose-600"
        />
        <StatCard icon={Package} label="Orders Counted" value={String(report.orderCount)} tint="bg-neutral-100 text-neutral-600" />
        <StatCard icon={TrendingUp} label="Average Order Value" value={formatMoney(report.averageOrderValue, currencySymbol)} tint="bg-purple-50 text-purple-600" />
        <StatCard icon={Utensils} label="Average Party Size" value={report.averagePartySize.toFixed(1)} tint="bg-cyan-50 text-cyan-600" />
        <StatCard icon={Users} label="Total Guests Served" value={String(report.totalGuests)} tint="bg-indigo-50 text-indigo-600" />
        <StatCard icon={Receipt} label="Tax Collected" value={formatMoney(report.totalTax, currencySymbol)} tint="bg-amber-50 text-amber-600" />
        <StatCard icon={PiggyBank} label="Donations" value={formatMoney(report.totalDonations, currencySymbol)} tint="bg-emerald-50 text-emerald-600" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-neutral-900">Item-wise Sold Quantity</h2>
          {report.itemWiseSoldQty.length === 0 ? (
            <p className="text-sm text-neutral-400">No sales recorded yet.</p>
          ) : (
            <div className="max-h-80 overflow-y-auto rounded-xl border border-neutral-100">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-neutral-50 text-left text-xs font-medium uppercase tracking-wide text-neutral-400">
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

        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-neutral-900">Item-wise Revenue</h2>
          {report.itemWiseRevenue.length === 0 ? (
            <p className="text-sm text-neutral-400">No sales recorded yet.</p>
          ) : (
            <div className="max-h-80 overflow-y-auto rounded-xl border border-neutral-100">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-neutral-50 text-left text-xs font-medium uppercase tracking-wide text-neutral-400">
                  <tr>
                    <th className="px-4 py-2.5">Item</th>
                    <th className="px-4 py-2.5 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {report.itemWiseRevenue.map((item) => (
                    <tr key={item.name}>
                      <td className="px-4 py-2.5 text-neutral-700">{item.name}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-neutral-900">
                        {formatMoney(item.revenue, currencySymbol)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function TrendsTab({ report, currencySymbol }: { report: ReportData; currencySymbol: string }) {
  const dailyData = report.dailySales.map((d) => ({ label: d.date.slice(5), value: d.revenue }));
  const hourlyData = report.hourlySales.map((h) => ({ label: `${h.hour}:00`, value: h.revenue }));
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-neutral-900">
          <TrendingUp className="h-4 w-4 text-teal-600" /> Daily Sales (Last 30 Days)
        </h2>
        <p className="mb-4 text-xs text-neutral-400">Total revenue recorded per day.</p>
        <RevenueLineChart data={dailyData} currencySymbol={currencySymbol} height={280} />
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-neutral-900">
          <TrendingUp className="h-4 w-4 text-teal-600" /> Sales by Hour of Day
        </h2>
        <p className="mb-4 text-xs text-neutral-400">Which hours bring in the most revenue, across all recorded orders.</p>
        <RevenueBarChart data={hourlyData} currencySymbol={currencySymbol} height={280} />
      </div>
    </div>
  );
}

function ChannelTab({ report, currencySymbol }: { report: ReportData; currencySymbol: string }) {
  const chartData = report.byChannel.map((c) => ({ label: c.channel, value: c.revenue }));
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-neutral-900">
        <LayoutGrid className="h-4 w-4 text-teal-600" /> Sales by Channel
      </h2>
      <p className="mb-4 text-xs text-neutral-400">Dine in, Take Away, Delivery, third-party providers, Online.</p>
      {report.byChannel.length === 0 ? (
        <p className="text-sm text-neutral-400">No sales recorded yet.</p>
      ) : (
        <>
          <RevenueBarChart data={chartData} currencySymbol={currencySymbol} />
          <div className="mt-4 divide-y divide-neutral-100 border-t border-neutral-100">
            {report.byChannel.map((c) => (
              <div key={c.channel} className="flex items-center justify-between py-2 text-sm">
                <span className="font-medium text-neutral-700">{c.channel}</span>
                <span className="text-neutral-500">
                  {formatMoney(c.revenue, currencySymbol)} · {c.count} order{c.count === 1 ? "" : "s"}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PaymentMethodTab({ report, currencySymbol }: { report: ReportData; currencySymbol: string }) {
  const chartData = report.byPaymentMethod.map((p) => ({ label: p.method, value: p.revenue }));
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-neutral-900">
        <CreditCard className="h-4 w-4 text-teal-600" /> Sales by Payment Method
      </h2>
      <p className="mb-4 text-xs text-neutral-400">
        Per named terminal — split-payment orders count toward each method they used.
      </p>
      {report.byPaymentMethod.length === 0 ? (
        <p className="text-sm text-neutral-400">No sales recorded yet.</p>
      ) : (
        <RevenuePieChart data={chartData} currencySymbol={currencySymbol} height={300} />
      )}
    </div>
  );
}

function CategoryTab({ report, currencySymbol }: { report: ReportData; currencySymbol: string }) {
  const chartData = report.byCategory.map((c) => ({ label: c.category, value: c.revenue }));
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-neutral-900">
        <Tag className="h-4 w-4 text-teal-600" /> Sales by Menu Category
      </h2>
      <p className="mb-4 text-xs text-neutral-400">Revenue and quantity sold, grouped by each dish&apos;s category.</p>
      {report.byCategory.length === 0 ? (
        <p className="text-sm text-neutral-400">No sales recorded yet.</p>
      ) : (
        <>
          <RevenueBarChart data={chartData} currencySymbol={currencySymbol} color="#6366f1" />
          <div className="mt-4 overflow-hidden rounded-xl border border-neutral-100">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs font-medium uppercase tracking-wide text-neutral-400">
                <tr>
                  <th className="px-4 py-2.5">Category</th>
                  <th className="px-4 py-2.5 text-right">Qty Sold</th>
                  <th className="px-4 py-2.5 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {report.byCategory.map((c) => (
                  <tr key={c.category}>
                    <td className="px-4 py-2.5 text-neutral-700">{c.category}</td>
                    <td className="px-4 py-2.5 text-right text-neutral-500">{c.qty}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-neutral-900">
                      {formatMoney(c.revenue, currencySymbol)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function StaffTab({ report, currencySymbol }: { report: ReportData; currencySymbol: string }) {
  const chartData = report.byStaff.map((s) => ({ label: s.name, value: s.revenue }));
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-neutral-900">
        <UserCircle className="h-4 w-4 text-teal-600" /> Sales by Staff
      </h2>
      <p className="mb-4 text-xs text-neutral-400">Who rang up each order — includes Till PIN sessions.</p>
      {report.byStaff.length === 0 ? (
        <p className="text-sm text-neutral-400">No sales recorded yet.</p>
      ) : (
        <>
          <RevenueBarChart data={chartData} currencySymbol={currencySymbol} color="#f59e0b" />
          <div className="mt-4 overflow-hidden rounded-xl border border-neutral-100">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs font-medium uppercase tracking-wide text-neutral-400">
                <tr>
                  <th className="px-4 py-2.5">Staff</th>
                  <th className="px-4 py-2.5 text-right">Orders</th>
                  <th className="px-4 py-2.5 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {report.byStaff.map((s) => (
                  <tr key={s.name}>
                    <td className="px-4 py-2.5 text-neutral-700">{s.name}</td>
                    <td className="px-4 py-2.5 text-right text-neutral-500">{s.count}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-neutral-900">
                      {formatMoney(s.revenue, currencySymbol)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
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
