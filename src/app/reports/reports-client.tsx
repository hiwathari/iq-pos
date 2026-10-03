"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { formatMoney, orderSequence, formatOrderTimestamp } from "@/lib/types";
import type { Order, Reservation, PettyCashEntry, PaymentTerminal, TerminalPayout, TerminalExpense } from "@/lib/types";
import type { ReportData, DailySummary, WeeklyDaySummary } from "@/lib/data/reports";
import type { TerminalSettlementReport, TerminalSettlementRow } from "@/lib/data/terminal-settlements";
import { businessDateKey, shiftDateKey } from "@/lib/business-day";
import { addPettyCashEntryAction, deletePettyCashEntryAction } from "@/lib/actions/petty-cash";
import {
  addTerminalPayoutAction,
  deleteTerminalPayoutAction,
  addTerminalExpenseAction,
  deleteTerminalExpenseAction,
} from "@/lib/actions/terminal-settlements";
import { RevenueBarChart, RevenueLineChart, RevenuePieChart } from "@/components/charts";
import { SortableTable, type Column } from "./sortable-table";
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
  TrendingUp,
  Utensils,
  Tag,
  Printer,
  Globe,
  Store,
  CalendarClock,
  CalendarRange,
  Wallet2,
  Plus,
  Trash2,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  Landmark,
  ReceiptText,
  AlertTriangle,
} from "lucide-react";

export interface ReportsSearchParams {
  tab?: string;
  from?: string;
  to?: string;
  date?: string;
  week?: string;
  terminal?: string;
}

// A tiny top-level wrapper around Date.now() (rather than calling it directly inside a
// component's body) keeps the component itself free of impure calls, per the project's
// react-hooks purity lint rule.
function currentBusinessDateKey(openTime: string | null, timezone: string) {
  return businessDateKey(Date.now(), openTime, timezone);
}

const TABS: { slug: string; label: string }[] = [
  { slug: "overview", label: "Overview" },
  { slug: "trends", label: "Trends" },
  { slug: "channel", label: "By Channel" },
  { slug: "payment", label: "By Payment Method" },
  { slug: "category", label: "By Category" },
  { slug: "waiter", label: "Waiter Report" },
  { slug: "daily", label: "Daily Summary" },
  { slug: "weekly", label: "Weekly Summary" },
  { slug: "online", label: "Online Orders" },
  { slug: "offline", label: "Offline Orders" },
  { slug: "bookings", label: "Bookings" },
  { slug: "pettycash", label: "Petty Cash" },
  { slug: "cardsettlements", label: "Card Settlements" },
];

export function ReportsClient({
  tab,
  fromStr,
  toStr,
  dateStr,
  weekStr,
  report,
  currencySymbol,
  ordersInRange,
  reservationsInRange,
  pettyCash,
  dailySummary,
  weeklySummary,
  openTime,
  timezone,
  paymentTerminals,
  selectedTerminalId,
  settlementReport,
  terminalPayouts,
  terminalExpenses,
}: {
  tab: string;
  fromStr: string;
  toStr: string;
  dateStr: string;
  weekStr: string;
  report: ReportData;
  currencySymbol: string;
  ordersInRange: Order[];
  reservationsInRange: Reservation[];
  pettyCash: PettyCashEntry[];
  dailySummary: DailySummary | null;
  weeklySummary: WeeklyDaySummary[] | null;
  openTime: string | null;
  timezone: string;
  paymentTerminals: PaymentTerminal[];
  selectedTerminalId: string;
  settlementReport: TerminalSettlementReport | null;
  terminalPayouts: TerminalPayout[];
  terminalExpenses: TerminalExpense[];
}) {
  return (
    <div>
      <ReportFilterBar
        tab={tab}
        fromStr={fromStr}
        toStr={toStr}
        dateStr={dateStr}
        weekStr={weekStr}
        openTime={openTime}
        timezone={timezone}
        paymentTerminals={paymentTerminals}
        selectedTerminalId={selectedTerminalId}
      />

      <div id="report-print-area">
        {tab === "overview" && <OverviewTab report={report} currencySymbol={currencySymbol} />}
        {tab === "trends" && <TrendsTab report={report} currencySymbol={currencySymbol} />}
        {tab === "channel" && <ChannelTab report={report} currencySymbol={currencySymbol} />}
        {tab === "payment" && <PaymentMethodTab report={report} currencySymbol={currencySymbol} />}
        {tab === "category" && <CategoryTab report={report} currencySymbol={currencySymbol} />}
        {tab === "waiter" && <WaiterReportTab report={report} currencySymbol={currencySymbol} />}
        {tab === "daily" && dailySummary && <DailySummaryTab summary={dailySummary} currencySymbol={currencySymbol} />}
        {tab === "weekly" && weeklySummary && <WeeklySummaryTab days={weeklySummary} currencySymbol={currencySymbol} />}
        {tab === "online" && <OnlineOfflineTab orders={ordersInRange} currencySymbol={currencySymbol} online />}
        {tab === "offline" && <OnlineOfflineTab orders={ordersInRange} currencySymbol={currencySymbol} online={false} />}
        {tab === "bookings" && <BookingsTab reservations={reservationsInRange} />}
        {tab === "pettycash" && <PettyCashTab entries={pettyCash} currencySymbol={currencySymbol} />}
        {tab === "cardsettlements" && settlementReport && (
          <CardSettlementsTab
            currencySymbol={currencySymbol}
            paymentTerminals={paymentTerminals}
            selectedTerminalId={selectedTerminalId}
            settlementReport={settlementReport}
            payouts={terminalPayouts}
            expenses={terminalExpenses}
          />
        )}
      </div>
    </div>
  );
}

const RANGE_PRESETS: { label: string; days: number | "all" }[] = [
  { label: "Today", days: 0 },
  { label: "Last 7 Days", days: 6 },
  { label: "Last 30 Days", days: 29 },
  { label: "Last 90 Days", days: 89 },
  { label: "All Time", days: "all" },
];

function ReportFilterBar({
  tab,
  fromStr,
  toStr,
  dateStr,
  weekStr,
  openTime,
  timezone,
  paymentTerminals,
  selectedTerminalId,
}: {
  tab: string;
  fromStr: string;
  toStr: string;
  dateStr: string;
  weekStr: string;
  openTime: string | null;
  timezone: string;
  paymentTerminals: PaymentTerminal[];
  selectedTerminalId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function navigate(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined) params.delete(key);
      else params.set(key, value);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  // "Today" and the other presets follow the restaurant's own business day (see
  // lib/business-day.ts) — not plain UTC midnight — so they land on the same day the Daily
  // Summary/Kitchen Display would call "today", even right around midnight.
  function applyPreset(days: number | "all") {
    const today = currentBusinessDateKey(openTime, timezone);
    if (days === "all") {
      navigate({ from: "2000-01-01", to: today });
      return;
    }
    navigate({ from: shiftDateKey(today, -days), to: today });
  }

  const weekEndStr = shiftDateKey(weekStr, 6);

  return (
    <div className="mb-6 print:hidden">
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-white p-1">
        {TABS.map((t) => (
          <button
            key={t.slug}
            onClick={() => navigate({ tab: t.slug })}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.slug ? "bg-[var(--brand)] text-white" : "text-neutral-500 hover:bg-neutral-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {tab === "daily" ? (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => navigate({ date: shiftDateKey(dateStr, -1) })}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50"
              aria-label="Previous day"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <input
              type="date"
              value={dateStr}
              onChange={(e) => navigate({ date: e.target.value })}
              className="rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
            />
            <button
              onClick={() => navigate({ date: shiftDateKey(dateStr, 1) })}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50"
              aria-label="Next day"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => navigate({ date: currentBusinessDateKey(openTime, timezone) })}
              className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-500 hover:bg-neutral-50"
            >
              Today
            </button>
          </div>
        ) : tab === "weekly" ? (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => navigate({ week: shiftDateKey(weekStr, -7) })}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50"
              aria-label="Previous week"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700">
              {weekStr} — {weekEndStr}
            </span>
            <button
              onClick={() => navigate({ week: shiftDateKey(weekStr, 7) })}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50"
              aria-label="Next week"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => navigate({ week: shiftDateKey(currentBusinessDateKey(openTime, timezone), -6) })}
              className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-500 hover:bg-neutral-50"
            >
              This Week
            </button>
          </div>
        ) : (
          <>
            {RANGE_PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p.days)}
                className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-500 hover:bg-neutral-50"
              >
                {p.label}
              </button>
            ))}
            <input
              type="date"
              value={fromStr}
              onChange={(e) => navigate({ from: e.target.value })}
              className="rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
            />
            <span className="text-sm text-neutral-400">to</span>
            <input
              type="date"
              value={toStr}
              onChange={(e) => navigate({ to: e.target.value })}
              className="rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
            />
          </>
        )}
        {tab === "cardsettlements" && paymentTerminals.length > 0 && (
          <select
            value={selectedTerminalId}
            onChange={(e) => navigate({ terminal: e.target.value })}
            className="rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
          >
            {paymentTerminals.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={() => window.print()}
          className="ml-auto flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-sm font-semibold text-neutral-600 hover:bg-neutral-50"
        >
          <Printer className="h-4 w-4" /> Print
        </button>
      </div>
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
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-neutral-900">Item-wise Sold Quantity</h2>
          <SortableTable
            rows={report.itemWiseSoldQty}
            rowKey={(i) => i.name}
            emptyMessage="No sales recorded yet."
            defaultSortKey="qty"
            columns={[
              { key: "name", label: "Item", render: (i) => i.name },
              { key: "qty", label: "Qty Sold", align: "right", render: (i) => i.qty, sortValue: (i) => i.qty },
            ]}
          />
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-neutral-900">Item-wise Revenue</h2>
          <SortableTable
            rows={report.itemWiseRevenue}
            rowKey={(i) => i.name}
            emptyMessage="No sales recorded yet."
            defaultSortKey="revenue"
            columns={[
              { key: "name", label: "Item", render: (i) => i.name },
              {
                key: "revenue",
                label: "Revenue",
                align: "right",
                render: (i) => formatMoney(i.revenue, currencySymbol),
                sortValue: (i) => i.revenue,
              },
            ]}
          />
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
          <TrendingUp className="h-4 w-4 text-teal-600" /> Daily Sales
        </h2>
        <p className="mb-4 text-xs text-neutral-400">Total revenue recorded per day, over the selected range.</p>
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
          <div className="mt-4">
            <SortableTable
              rows={report.byCategory}
              rowKey={(c) => c.category}
              emptyMessage="No sales recorded yet."
              defaultSortKey="revenue"
              columns={[
                { key: "category", label: "Category", render: (c) => c.category },
                { key: "qty", label: "Qty Sold", align: "right", render: (c) => c.qty, sortValue: (c) => c.qty },
                {
                  key: "revenue",
                  label: "Revenue",
                  align: "right",
                  render: (c) => formatMoney(c.revenue, currencySymbol),
                  sortValue: (c) => c.revenue,
                },
              ]}
            />
          </div>
        </>
      )}
    </div>
  );
}

function WaiterReportTab({ report, currencySymbol }: { report: ReportData; currencySymbol: string }) {
  const chartData = report.byStaff.map((s) => ({ label: s.name, value: s.revenue }));
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-neutral-900">
        <UserCircle className="h-4 w-4 text-teal-600" /> Waiter Report
      </h2>
      <p className="mb-4 text-xs text-neutral-400">Who rang up each order — includes Till PIN sessions.</p>
      {report.byStaff.length === 0 ? (
        <p className="text-sm text-neutral-400">No sales recorded yet.</p>
      ) : (
        <>
          <RevenueBarChart data={chartData} currencySymbol={currencySymbol} color="#f59e0b" />
          <div className="mt-4">
            <SortableTable
              rows={report.byStaff}
              rowKey={(s) => s.name}
              emptyMessage="No sales recorded yet."
              defaultSortKey="revenue"
              columns={[
                { key: "name", label: "Staff", render: (s) => s.name },
                { key: "count", label: "Orders", align: "right", render: (s) => s.count, sortValue: (s) => s.count },
                {
                  key: "revenue",
                  label: "Revenue",
                  align: "right",
                  render: (s) => formatMoney(s.revenue, currencySymbol),
                  sortValue: (s) => s.revenue,
                },
                {
                  key: "avg",
                  label: "Avg / Order",
                  align: "right",
                  render: (s) => formatMoney(s.count > 0 ? s.revenue / s.count : 0, currencySymbol),
                  sortValue: (s) => (s.count > 0 ? s.revenue / s.count : 0),
                },
              ]}
            />
          </div>
        </>
      )}
    </div>
  );
}

function DailySummaryTab({ summary, currencySymbol }: { summary: DailySummary; currencySymbol: string }) {
  const d = summary.detail;
  const detailRows: [string, string][] = [
    ["Opening Balance", formatMoney(d.openingBalance, currencySymbol)],
    ["Total Bookings", String(d.totalBookings)],
    ["Total Guests (Bookings)", String(d.totalGuests)],
    ["Total Dine-In Customers", String(d.totalDineInCustomers)],
    ["Total In-Store Cash Orders", String(d.totalInStoreCashOrders)],
    ["Total In-Store Card Orders", String(d.totalInStoreCardOrders)],
    ["Total In-Store Orders", String(d.totalInStoreOrders)],
    ["Total Online Cash Orders", String(d.totalOnlineCashOrders)],
    ["Total Online Card Orders", String(d.totalOnlineCardOrders)],
    ["Total Online Orders", String(d.totalOnlineOrders)],
    ["Total Cash Amount", formatMoney(d.totalCashAmount, currencySymbol)],
    ["Total Petty Cash", formatMoney(d.totalPettyCash, currencySymbol)],
    ["Total Cash Present", formatMoney(d.totalCashPresent, currencySymbol)],
    ["Total Card Amount (In-Store Machine)", formatMoney(d.totalCardAmount, currencySymbol)],
    ["Total Online Card Amount", formatMoney(d.totalOnlineCardAmount, currencySymbol)],
    ["Total Amount", formatMoney(d.totalAmount, currencySymbol)],
    ["Total Discount Amount", formatMoney(d.totalDiscountAmount, currencySymbol)],
    ["Closing Balance", formatMoney(d.closingBalance, currencySymbol)],
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-neutral-900">
          <CalendarClock className="h-4 w-4 text-teal-600" /> Orders List — {summary.date}
        </h2>
        <div className="mt-3">
          <SortableTable
            rows={summary.ordersList}
            rowKey={(o) => o.orderNumber}
            emptyMessage="No orders placed on this date."
            columns={[
              { key: "sn", label: "SN", render: (o) => o.sn, sortValue: (o) => o.sn },
              { key: "seq", label: "Order No", render: (o) => o.seq, sortValue: (o) => o.seq },
              { key: "mode", label: "Order Mode", render: (o) => o.mode },
              { key: "type", label: "Order Type", render: (o) => o.type },
              {
                key: "total",
                label: "Total Payable",
                align: "right",
                render: (o) => formatMoney(o.totalPayable, currencySymbol),
                sortValue: (o) => o.totalPayable,
              },
            ]}
          />
        </div>
        <div className="mt-3 text-right text-sm font-bold text-neutral-900">
          SUM: {formatMoney(summary.ordersSum, currencySymbol)}
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Petty Cash Details</h2>
        {summary.pettyCash.length === 0 ? (
          <p className="text-sm text-neutral-400">No Petty cash available for the selected date.</p>
        ) : (
          <div className="space-y-1.5">
            {summary.pettyCash.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <span className="text-neutral-700">{p.description}</span>
                <span className={p.direction === "in" ? "font-semibold text-emerald-600" : "font-semibold text-rose-600"}>
                  {p.direction === "in" ? "+" : "-"}
                  {formatMoney(p.amount, currencySymbol)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Cancelled Orders Details</h2>
        {summary.cancelledOrders.length === 0 ? (
          <p className="text-sm text-neutral-400">No Cancelled Orders available for the selected date.</p>
        ) : (
          <div className="space-y-1.5">
            {summary.cancelledOrders.map((o) => (
              <div key={o.orderNumber} className="flex items-center justify-between text-sm">
                <span className="text-neutral-700">
                  #{o.orderNumber} · Seq {o.seq}
                  {o.reason ? ` — ${o.reason}` : ""}
                </span>
                <span className="font-semibold text-rose-600">{formatMoney(o.amount, currencySymbol)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Sale Items Details</h2>
        <SortableTable
          rows={summary.saleItems}
          rowKey={(i) => i.name}
          emptyMessage="No items sold on this date."
          defaultSortKey="qty"
          columns={[
            { key: "name", label: "Menu Name", render: (i) => i.name },
            { key: "qty", label: "Total Sales", align: "right", render: (i) => i.qty, sortValue: (i) => i.qty },
          ]}
        />
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Detailed Report</h2>
        <div className="overflow-hidden rounded-xl border border-neutral-100">
          {detailRows.map(([label, value], idx) => (
            <div
              key={label}
              className={`grid grid-cols-2 px-4 py-2.5 text-sm ${idx % 2 === 0 ? "bg-neutral-50" : "bg-white"}`}
            >
              <span className="text-neutral-500">{label}</span>
              <span className="font-semibold text-neutral-900">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WeeklySummaryTab({ days, currencySymbol }: { days: WeeklyDaySummary[]; currencySymbol: string }) {
  const totals = days.reduce(
    (acc, d) => ({
      totalSales: acc.totalSales + d.totalSales,
      cashSales: acc.cashSales + d.cashSales,
      cardSales: acc.cardSales + d.cardSales,
      orderCount: acc.orderCount + d.orderCount,
      voidCount: acc.voidCount + d.voidCount,
      voidAmount: acc.voidAmount + d.voidAmount,
    }),
    { totalSales: 0, cashSales: 0, cardSales: 0, orderCount: 0, voidCount: 0, voidAmount: 0 }
  );

  return (
    <div className="space-y-5">
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={DollarSign} label="Week Total Sales" value={formatMoney(totals.totalSales, currencySymbol)} tint="bg-teal-50 text-teal-600" />
        <StatCard icon={Wallet} label="Week Cash Sales" value={formatMoney(totals.cashSales, currencySymbol)} tint="bg-emerald-50 text-emerald-600" />
        <StatCard icon={CreditCard} label="Week Card Sales" value={formatMoney(totals.cardSales, currencySymbol)} tint="bg-blue-50 text-blue-600" />
        <StatCard icon={Package} label="Week Orders" value={String(totals.orderCount)} tint="bg-neutral-100 text-neutral-600" />
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-neutral-900">
          <CalendarRange className="h-4 w-4 text-teal-600" /> Day-by-Day
        </h2>
        <div className="mt-3">
          <SortableTable
            rows={days}
            rowKey={(d) => d.date}
            emptyMessage="No sales recorded this week."
            columns={[
              { key: "date", label: "Date", render: (d) => d.date },
              { key: "orders", label: "Orders", align: "right", render: (d) => d.orderCount, sortValue: (d) => d.orderCount },
              {
                key: "cash",
                label: "Cash",
                align: "right",
                render: (d) => formatMoney(d.cashSales, currencySymbol),
                sortValue: (d) => d.cashSales,
              },
              {
                key: "card",
                label: "Card",
                align: "right",
                render: (d) => formatMoney(d.cardSales, currencySymbol),
                sortValue: (d) => d.cardSales,
              },
              {
                key: "total",
                label: "Total",
                align: "right",
                render: (d) => formatMoney(d.totalSales, currencySymbol),
                sortValue: (d) => d.totalSales,
              },
              {
                key: "void",
                label: "Voided",
                align: "right",
                render: (d) => (d.voidCount > 0 ? `${d.voidCount} (${formatMoney(d.voidAmount, currencySymbol)})` : "—"),
                sortValue: (d) => d.voidAmount,
              },
            ]}
            defaultSortKey="date"
          />
        </div>
        <div className="mt-3 flex justify-end gap-6 text-sm font-bold text-neutral-900">
          <span>Total: {formatMoney(totals.totalSales, currencySymbol)}</span>
        </div>
      </div>
    </div>
  );
}

function OnlineOfflineTab({ orders, currencySymbol, online }: { orders: Order[]; currencySymbol: string; online: boolean }) {
  const filtered = orders.filter((o) => (online ? o.placedVia !== "staff" : o.placedVia === "staff") && o.status !== "Voided");
  const total = filtered.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.price * i.qty, 0), 0);
  const columns: Column<Order>[] = [
    { key: "orderNumber", label: "Order #", render: (o) => o.orderNumber },
    { key: "seq", label: "Seq", render: (o) => orderSequence(o.orderNumber), sortValue: (o) => orderSequence(o.orderNumber) },
    { key: "createdAt", label: "Placed", render: (o) => formatOrderTimestamp(o.createdAt), sortValue: (o) => o.createdAt },
    { key: "channel", label: "Channel", render: (o) => o.channel },
    { key: "placedVia", label: "Via", render: (o) => (o.placedVia === "staff" ? "Staff" : o.placedVia === "kiosk" ? "Kiosk" : "Online") },
    { key: "status", label: "Status", render: (o) => o.status },
    {
      key: "total",
      label: "Total",
      align: "right",
      render: (o) => formatMoney(o.items.reduce((s, i) => s + i.price * i.qty, 0), currencySymbol),
      sortValue: (o) => o.items.reduce((s, i) => s + i.price * i.qty, 0),
    },
  ];

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-neutral-900">
        {online ? <Globe className="h-4 w-4 text-teal-600" /> : <Store className="h-4 w-4 text-teal-600" />}
        {online ? "Online Order Report" : "Offline (In-Store) Order Report"}
      </h2>
      <p className="mb-4 text-xs text-neutral-400">
        {filtered.length} order{filtered.length === 1 ? "" : "s"} · {formatMoney(total, currencySymbol)} total, over the selected range.
      </p>
      <SortableTable
        rows={filtered}
        rowKey={(o) => o.id}
        emptyMessage="No orders in this range."
        defaultSortKey="createdAt"
        columns={columns}
      />
    </div>
  );
}

function BookingsTab({ reservations }: { reservations: Reservation[] }) {
  const columns: Column<Reservation>[] = [
    { key: "customerName", label: "Customer", render: (r) => r.customerName },
    { key: "phone", label: "Phone", render: (r) => r.phone ?? "—" },
    { key: "date", label: "Date", render: (r) => r.date },
    { key: "time", label: "Time", render: (r) => r.time },
    { key: "guests", label: "Guests", align: "right", render: (r) => r.guests, sortValue: (r) => r.guests },
    { key: "meal", label: "Meal", render: (r) => r.meal },
    { key: "source", label: "Source", render: (r) => r.source },
    { key: "status", label: "Status", render: (r) => r.status },
  ];
  const totalGuests = reservations.reduce((sum, r) => sum + r.guests, 0);

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-neutral-900">
        <ClipboardList className="h-4 w-4 text-teal-600" /> Booking Report
      </h2>
      <p className="mb-4 text-xs text-neutral-400">
        {reservations.length} booking{reservations.length === 1 ? "" : "s"} · {totalGuests} guest{totalGuests === 1 ? "" : "s"}, over the selected range.
      </p>
      <SortableTable
        rows={reservations}
        rowKey={(r) => r.id}
        emptyMessage="No bookings in this range."
        defaultSortKey="date"
        columns={columns}
      />
    </div>
  );
}

function PettyCashTab({ entries, currencySymbol }: { entries: PettyCashEntry[]; currencySymbol: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"in" | "out">("out");
  const [error, setError] = useState<string | null>(null);

  const net = entries.reduce((sum, e) => sum + (e.direction === "in" ? e.amount : -e.amount), 0);

  function submit() {
    const value = Number(amount);
    if (!description.trim() || !value || value <= 0) {
      setError("Enter a description and an amount greater than 0.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await addPettyCashEntryAction(description, value, direction);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setDescription("");
      setAmount("");
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await deletePettyCashEntryAction(id);
      router.refresh();
    });
  }

  const columns: Column<PettyCashEntry>[] = [
    { key: "createdAt", label: "Date", render: (e) => formatOrderTimestamp(e.createdAt), sortValue: (e) => e.createdAt },
    { key: "description", label: "Description", render: (e) => e.description },
    { key: "createdByName", label: "By", render: (e) => e.createdByName ?? "—" },
    {
      key: "amount",
      label: "Amount",
      align: "right",
      render: (e) => (
        <span className={e.direction === "in" ? "font-semibold text-emerald-600" : "font-semibold text-rose-600"}>
          {e.direction === "in" ? "+" : "-"}
          {formatMoney(e.amount, currencySymbol)}
        </span>
      ),
      sortValue: (e) => (e.direction === "in" ? e.amount : -e.amount),
    },
    {
      key: "actions",
      label: "",
      align: "right",
      render: (e) => (
        <button onClick={() => remove(e.id)} className="text-neutral-300 hover:text-rose-500 print:hidden">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 print:hidden">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-900">
          <Wallet2 className="h-4 w-4 text-teal-600" /> Add Petty Cash Entry
        </h2>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1 block text-xs font-medium text-neutral-500">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Bought cleaning supplies"
              className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Amount</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-28 rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
            />
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-neutral-200 p-1">
            <button
              onClick={() => setDirection("out")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${direction === "out" ? "bg-rose-500 text-white" : "text-neutral-500"}`}
            >
              Cash Out
            </button>
            <button
              onClick={() => setDirection("in")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${direction === "in" ? "bg-emerald-500 text-white" : "text-neutral-500"}`}
            >
              Cash In
            </button>
          </div>
          <button
            onClick={submit}
            className="flex items-center gap-1.5 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]"
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
        {error && <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>}
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900">Petty Cash Ledger</h2>
          <span className={`text-sm font-bold ${net >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            Net: {formatMoney(net, currencySymbol)}
          </span>
        </div>
        <SortableTable
          rows={entries}
          rowKey={(e) => e.id}
          emptyMessage="No petty cash entries in this range."
          defaultSortKey="createdAt"
          columns={columns}
        />
      </div>
    </div>
  );
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function CardSettlementsTab({
  currencySymbol,
  paymentTerminals,
  selectedTerminalId,
  settlementReport,
  payouts,
  expenses,
}: {
  currencySymbol: string;
  paymentTerminals: PaymentTerminal[];
  selectedTerminalId: string;
  settlementReport: TerminalSettlementReport;
  payouts: TerminalPayout[];
  expenses: TerminalExpense[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const selectedTerminalName = paymentTerminals.find((t) => t.id === selectedTerminalId)?.name ?? "—";

  const totals = settlementReport.rows.reduce(
    (sum, r) => ({
      grossSales: sum.grossSales + r.grossSales,
      expense: sum.expense + r.expense,
      payout: sum.payout + r.payout,
      variance: sum.variance + r.variance,
    }),
    { grossSales: 0, expense: 0, payout: 0, variance: 0 }
  );

  const payoutColumns: Column<TerminalPayout>[] = [
    { key: "date", label: "Date", render: (p) => p.date },
    { key: "note", label: "Note", render: (p) => p.note ?? "—" },
    { key: "createdByName", label: "By", render: (p) => p.createdByName ?? "—" },
    {
      key: "amount",
      label: "Amount",
      align: "right",
      render: (p) => <span className="font-semibold text-emerald-600">{formatMoney(p.amount, currencySymbol)}</span>,
      sortValue: (p) => p.amount,
    },
    {
      key: "actions",
      label: "",
      align: "right",
      render: (p) => (
        <button
          onClick={() => startTransition(async () => { await deleteTerminalPayoutAction(p.id); router.refresh(); })}
          className="text-neutral-300 hover:text-rose-500 print:hidden"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ),
    },
  ];

  const expenseColumns: Column<TerminalExpense>[] = [
    { key: "date", label: "Date", render: (e) => e.date },
    { key: "description", label: "Description", render: (e) => e.description },
    { key: "createdByName", label: "By", render: (e) => e.createdByName ?? "—" },
    {
      key: "amount",
      label: "Amount",
      align: "right",
      render: (e) => <span className="font-semibold text-rose-600">{formatMoney(e.amount, currencySymbol)}</span>,
      sortValue: (e) => e.amount,
    },
    {
      key: "actions",
      label: "",
      align: "right",
      render: (e) => (
        <button
          onClick={() => startTransition(async () => { await deleteTerminalExpenseAction(e.id); router.refresh(); })}
          className="text-neutral-300 hover:text-rose-500 print:hidden"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ),
    },
  ];

  const settlementColumns: Column<TerminalSettlementRow>[] = [
    { key: "date", label: "Date", render: (r) => r.date },
    { key: "terminalName", label: "Terminal", render: (r) => r.terminalName },
    {
      key: "grossSales",
      label: "Gross Sales",
      align: "right",
      render: (r) => formatMoney(r.grossSales, currencySymbol),
      sortValue: (r) => r.grossSales,
    },
    {
      key: "shiftCounted",
      label: "Shift-Counted",
      align: "right",
      render: (r) => (r.shiftCounted === null ? "—" : formatMoney(r.shiftCounted, currencySymbol)),
      sortValue: (r) => r.shiftCounted ?? 0,
    },
    {
      key: "expense",
      label: "Commission",
      align: "right",
      render: (r) => formatMoney(r.expense, currencySymbol),
      sortValue: (r) => r.expense,
    },
    {
      key: "payout",
      label: "Payout",
      align: "right",
      render: (r) => formatMoney(r.payout, currencySymbol),
      sortValue: (r) => r.payout,
    },
    {
      key: "variance",
      label: "Variance",
      align: "right",
      render: (r) => {
        const flagged = Math.abs(r.variance) >= 0.01;
        return (
          <span className={`flex items-center justify-end gap-1 font-semibold ${flagged ? "text-amber-600" : "text-neutral-400"}`}>
            {flagged && <AlertTriangle className="h-3.5 w-3.5" />}
            {formatMoney(r.variance, currencySymbol)}
          </span>
        );
      },
      sortValue: (r) => r.variance,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 print:grid-cols-4">
        <StatCard icon={CreditCard} label="Gross Card Sales" value={formatMoney(totals.grossSales, currencySymbol)} tint="bg-blue-50 text-blue-600" />
        <StatCard icon={ReceiptText} label="Commission / Fees" value={formatMoney(totals.expense, currencySymbol)} tint="bg-rose-50 text-rose-600" />
        <StatCard icon={Landmark} label="Payouts Received" value={formatMoney(totals.payout, currencySymbol)} tint="bg-emerald-50 text-emerald-600" />
        <StatCard
          icon={AlertTriangle}
          label="Total Variance"
          value={formatMoney(totals.variance, currencySymbol)}
          tint={Math.abs(totals.variance) >= 0.01 ? "bg-amber-50 text-amber-600" : "bg-neutral-100 text-neutral-500"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 print:hidden">
        <TerminalLedgerForm
          title={`Add Payout — ${selectedTerminalName}`}
          icon={Landmark}
          noteLabel="Note (optional)"
          notePlaceholder="e.g. Bank deposit ref #1234"
          noteRequired={false}
          submitLabel="Add Payout"
          onSubmit={(date, amount, note) =>
            startTransition(async () => {
              await addTerminalPayoutAction(selectedTerminalId, date, amount, note);
              router.refresh();
            })
          }
        />
        <TerminalLedgerForm
          title={`Add Commission / Fee — ${selectedTerminalName}`}
          icon={ReceiptText}
          noteLabel="Description"
          notePlaceholder="e.g. Transaction fees for the day"
          noteRequired
          submitLabel="Add Expense"
          onSubmit={(date, amount, description) =>
            startTransition(async () => {
              await addTerminalExpenseAction(selectedTerminalId, date, amount, description);
              router.refresh();
            })
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Payouts — {selectedTerminalName}</h2>
          <SortableTable rows={payouts} rowKey={(p) => p.id} emptyMessage="No payouts logged in this range." defaultSortKey="date" columns={payoutColumns} />
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Commission / Fees — {selectedTerminalName}</h2>
          <SortableTable rows={expenses} rowKey={(e) => e.id} emptyMessage="No expenses logged in this range." defaultSortKey="date" columns={expenseColumns} />
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Reconciliation — All Terminals</h2>
        <p className="mb-3 text-xs text-neutral-400">
          Gross Sales is what the Till recorded. Shift-Counted is what staff counted into this terminal at End Day. Commission and
          Payout are what you logged here from the card machine&apos;s statement. Variance flags any day where Payout doesn&apos;t
          match Gross Sales minus Commission.
        </p>
        <SortableTable
          rows={settlementReport.rows}
          rowKey={(r) => `${r.date}::${r.terminalId}`}
          emptyMessage="No card activity in this range."
          defaultSortKey="date"
          columns={settlementColumns}
        />
      </div>
    </div>
  );
}

function TerminalLedgerForm({
  title,
  icon: Icon,
  noteLabel,
  notePlaceholder,
  noteRequired,
  submitLabel,
  onSubmit,
}: {
  title: string;
  icon: typeof Landmark;
  noteLabel: string;
  notePlaceholder: string;
  noteRequired: boolean;
  submitLabel: string;
  onSubmit: (date: string, amount: number, note: string) => void;
}) {
  const [date, setDate] = useState(todayStr());
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const value = Number(amount);
    if (!date || !value || value <= 0 || (noteRequired && !note.trim())) {
      setError(noteRequired ? "Pick a date, enter a description, and an amount greater than 0." : "Pick a date and enter an amount greater than 0.");
      return;
    }
    setError(null);
    onSubmit(date, value, note);
    setAmount("");
    setNote("");
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-900">
        <Icon className="h-4 w-4 text-teal-600" /> {title}
      </h2>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-500">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-500">Amount</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-28 rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
          />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="mb-1 block text-xs font-medium text-neutral-500">{noteLabel}</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={notePlaceholder}
            className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
          />
        </div>
        <button
          onClick={submit}
          className="flex items-center gap-1.5 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]"
        >
          <Plus className="h-4 w-4" /> {submitLabel}
        </button>
      </div>
      {error && <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>}
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
