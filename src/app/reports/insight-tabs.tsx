"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Globe,
  Package,
  Receipt,
  ShoppingBag,
  Tag,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import type { ReportInsights } from "@/lib/data/report-insights";
import type { Order } from "@/lib/types";
import { formatMoney, formatOrderTimestamp, orderBreakdown, orderSequence } from "@/lib/types";
import { RevenueCompareChart } from "@/components/charts";
import { SortableTable } from "./sortable-table";

type Money = (n: number) => string;

function Card({ title, sub, children, className = "", action }: { title: string; sub?: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <div className={`rounded-2xl border border-neutral-200 bg-white p-5 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
          {sub && <p className="mt-0.5 text-xs text-neutral-400">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Change({ current, previous, inverse = false }: { current: number; previous: number; inverse?: boolean }) {
  if (previous === 0 && current === 0) return <span className="text-xs text-neutral-400">No change</span>;
  if (previous === 0) return <span className="text-xs text-neutral-400">New this period</span>;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(pct) < 0.5) return <span className="text-xs text-neutral-400">Same as before</span>;
  const up = pct > 0;
  const good = inverse ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${good ? "text-emerald-600" : "text-rose-600"}`}>
      <Icon className="h-3.5 w-3.5" />
      {Math.abs(pct).toFixed(pct > -10 && pct < 10 ? 1 : 0)}% vs previous
    </span>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  current,
  previous,
  inverse,
  sub,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  current: number;
  previous: number;
  inverse?: boolean;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-neutral-500">
        <Icon className="h-4 w-4 text-neutral-400" /> {label}
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums text-neutral-900">{value}</div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2">
        <Change current={current} previous={previous} inverse={inverse} />
        {sub && <span className="text-xs text-neutral-400">{sub}</span>}
      </div>
    </div>
  );
}

function BarList({ rows, money, max }: { rows: { label: string; value: number; extra?: string }[]; money: Money; max?: number }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-neutral-400">Nothing in this period.</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-neutral-700">{r.label}</span>
            <span className="shrink-0 tabular-nums text-neutral-900">
              <b>{money(r.value)}</b>
              <span className="ml-1.5 text-xs text-neutral-400">{total ? `${((r.value / total) * 100).toFixed(0)}%` : ""}</span>
              {r.extra && <span className="ml-1.5 text-xs text-neutral-400">{r.extra}</span>}
            </span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-neutral-100">
            <div className="h-full rounded-full bg-[var(--brand,#0d9488)]" style={{ width: `${Math.max(2, (r.value / top) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Heatmap({ insights, money }: { insights: ReportInsights; money: Money }) {
  const hoursWithData = insights.heat.flatMap((row) => row.map((c, h) => (c.orders > 0 ? h : -1))).filter((h) => h >= 0);
  const start = hoursWithData.length ? Math.min(...hoursWithData) : 7;
  const end = hoursWithData.length ? Math.max(...hoursWithData) : 22;
  const hours = Array.from({ length: end - start + 1 }, (_, i) => start + i);
  const max = Math.max(1, ...insights.heat.flat().map((c) => c.revenue));
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-[3px] text-[11px]">
        <thead>
          <tr>
            <th />
            {hours.map((h) => (
              <th key={h} className="font-medium text-neutral-400">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {insights.heat.map((row, d) => (
            <tr key={d}>
              <td className="pr-2 text-right font-medium text-neutral-500">{insights.dayLabels[d]}</td>
              {hours.map((h) => {
                const c = row[h];
                const t = c.revenue / max;
                return (
                  <td
                    key={h}
                    title={`${insights.dayLabels[d]} ${h}:00–${h + 1}:00 · ${c.orders} orders · ${money(c.revenue)}`}
                    className="h-7 min-w-7 rounded"
                    style={{ background: c.orders ? `rgba(13,148,136,${0.12 + t * 0.88})` : "#f5f5f5" }}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-neutral-400">
        Quieter
        <span className="h-2 w-16 rounded-full" style={{ background: "linear-gradient(to right, rgba(13,148,136,0.12), rgba(13,148,136,1))" }} />
        Busier · hover a square for orders and sales
      </div>
    </div>
  );
}

function Alert({ tone, children, href }: { tone: "rose" | "amber" | "neutral"; children: React.ReactNode; href?: string }) {
  const cls =
    tone === "rose" ? "border-rose-200 bg-rose-50 text-rose-700" : tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-neutral-200 bg-white text-neutral-600";
  const body = (
    <span className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${cls}`}>
      <AlertTriangle className="h-4 w-4 shrink-0" /> {children}
    </span>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function DashboardTab({ insights, currencySymbol, tabHref }: { insights: ReportInsights; currencySymbol: string; tabHref: (tab: string) => string }) {
  const money: Money = (n) => formatMoney(n, currencySymbol);
  const { current: c, previous: p } = insights.kpis;
  const unbalanced = insights.endDays.filter((e) => Math.abs(e.difference) >= 0.01);

  return (
    <div className="space-y-4">
      {(unbalanced.length > 0 || c.unpaidCount > 0 || insights.lowStock.length > 0 || c.voidCount > 0) && (
        <div className="flex flex-wrap gap-2">
          {unbalanced.length > 0 && (
            <Alert tone="rose" href={tabHref("endday")}>
              {unbalanced.length} End Day {unbalanced.length === 1 ? "report doesn't" : "reports don't"} balance
            </Alert>
          )}
          {c.unpaidCount > 0 && (
            <Alert tone="amber">
              {c.unpaidCount} order{c.unpaidCount === 1 ? "" : "s"} not paid yet · {money(c.unpaidAmount)}
            </Alert>
          )}
          {insights.lowStock.length > 0 && (
            <Alert tone="amber" href={tabHref("stock")}>
              {insights.lowStock.length} stock item{insights.lowStock.length === 1 ? "" : "s"} running low
            </Alert>
          )}
          {c.voidCount > 0 && (
            <Alert tone="neutral" href={tabHref("voids")}>
              {c.voidCount} voided · {money(c.voidAmount)}
            </Alert>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={TrendingUp} label="Net sales" value={money(c.netSales)} current={c.netSales} previous={p.netSales} sub="after discounts" />
        <Kpi icon={Wallet} label="Money taken" value={money(c.moneyTaken)} current={c.moneyTaken} previous={p.moneyTaken} sub="cash + card" />
        <Kpi icon={Receipt} label="Orders" value={String(c.orders)} current={c.orders} previous={p.orders} />
        <Kpi icon={ShoppingBag} label="Average order" value={money(c.aov)} current={c.aov} previous={p.aov} />
        <Kpi icon={Users} label="Guests" value={String(c.guests)} current={c.guests} previous={p.guests} sub={`${money(c.perGuest)} per guest`} />
        <Kpi icon={Package} label="Items sold" value={String(c.itemsSold)} current={c.itemsSold} previous={p.itemsSold} />
        <Kpi icon={Tag} label="Discounts given" value={money(c.discounts)} current={c.discounts} previous={p.discounts} inverse />
        <Kpi
          icon={Globe}
          label="Online, QR & kiosk"
          value={money(c.customerOrderSales)}
          current={c.customerOrderSales}
          previous={p.customerOrderSales}
          sub={`${c.customerOrders} orders`}
        />
      </div>

      <Card title="Sales trend" sub="Net sales per day, this period against the same number of days just before it.">
        <RevenueCompareChart data={insights.trend} currencySymbol={currencySymbol} height={280} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Busy times" sub="Sales by weekday and hour — plan staffing and prep around the dark squares.">
          <Heatmap insights={insights} money={money} />
        </Card>
        <Card title="At a glance">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs text-neutral-400">Best day</dt>
              <dd className="font-semibold text-neutral-900">{insights.bestDay ? `${insights.bestDay.date} · ${money(insights.bestDay.revenue)}` : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-400">Quietest day</dt>
              <dd className="font-semibold text-neutral-900">{insights.quietestDay ? `${insights.quietestDay.date} · ${money(insights.quietestDay.revenue)}` : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-400">Days traded</dt>
              <dd className="font-semibold text-neutral-900">{insights.daysTraded}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-400">Tax collected</dt>
              <dd className="font-semibold text-neutral-900">{money(c.tax)}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-400">Kitchen time (median)</dt>
              <dd className="font-semibold text-neutral-900">{insights.speed.count ? `${insights.speed.median.toFixed(0)} min` : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-400">Repeat customers</dt>
              <dd className="font-semibold text-neutral-900">
                {insights.customers.repeat} of {insights.customers.identified}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-400">Loyalty orders</dt>
              <dd className="font-semibold text-neutral-900">
                {insights.customers.loyaltyOrders} · {money(insights.customers.loyaltySales)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-400">New loyalty members</dt>
              <dd className="font-semibold text-neutral-900">{insights.customers.newMembers}</dd>
            </div>
          </dl>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Top items" sub="By revenue before discounts" action={<Link href={tabHref("items")} className="text-xs font-semibold text-teal-700 hover:underline">All items</Link>}>
          <BarList rows={insights.items.slice(0, 8).map((i) => ({ label: i.name, value: i.revenue, extra: `${i.qty} sold` }))} money={money} />
        </Card>
        <Card title="Categories" sub="By revenue before discounts" action={<Link href={tabHref("category")} className="text-xs font-semibold text-teal-700 hover:underline">Category report</Link>}>
          <BarList rows={insights.byCategory.slice(0, 8)} money={money} />
        </Card>
        <Card title="Channels">
          <BarList rows={insights.byChannel} money={money} />
        </Card>
        <Card title="Payment methods" sub="What was paid by each method">
          <BarList rows={insights.byPayment} money={money} />
        </Card>
        <Card title="Staff" action={<Link href={tabHref("waiter")} className="text-xs font-semibold text-teal-700 hover:underline">Staff report</Link>}>
          <BarList rows={insights.staff.slice(0, 6).map((s) => ({ label: s.name, value: s.revenue, extra: `${s.orders} orders` }))} money={money} />
        </Card>
        <Card title="Best tables" action={<Link href={tabHref("tables")} className="text-xs font-semibold text-teal-700 hover:underline">All tables</Link>}>
          <BarList rows={insights.tables.slice(0, 6).map((t) => ({ label: `Table ${String(t.table).padStart(2, "0")}`, value: t.revenue, extra: `${t.orders} orders` }))} money={money} />
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="text-xs font-medium text-neutral-500">{label}</div>
      <div className="mt-1.5 text-xl font-bold tabular-nums text-neutral-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-neutral-400">{sub}</div>}
    </div>
  );
}

export function ItemsTab({ insights, currencySymbol }: { insights: ReportInsights; currencySymbol: string }) {
  const money: Money = (n) => formatMoney(n, currencySymbol);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Different items sold" value={String(insights.items.length)} />
        <Stat label="Items sold" value={String(insights.items.reduce((s, i) => s + i.qty, 0))} />
        <Stat label="Best seller" value={insights.items[0]?.name ?? "—"} sub={insights.items[0] ? money(insights.items[0].revenue) : undefined} />
        <Stat label="Not sold this period" value={String(insights.slowMovers.length)} sub="menu items with no sales" />
      </div>
      <Card title="Item sales" sub="Tap a column to sort. Revenue is before discounts.">
        <SortableTable
          rows={insights.items}
          rowKey={(i) => i.key}
          defaultSortKey="revenue"
          emptyMessage="No sales in this period."
          columns={[
            { key: "name", label: "Item", render: (i) => i.name },
            { key: "category", label: "Category", render: (i) => i.category, sortValue: (i) => i.category },
            { key: "qty", label: "Sold", align: "right", render: (i) => i.qty, sortValue: (i) => i.qty },
            { key: "orders", label: "Orders", align: "right", render: (i) => i.orders, sortValue: (i) => i.orders },
            { key: "avg", label: "Avg price", align: "right", render: (i) => money(i.avgPrice), sortValue: (i) => i.avgPrice },
            { key: "revenue", label: "Revenue", align: "right", render: (i) => money(i.revenue), sortValue: (i) => i.revenue },
            { key: "share", label: "Share", align: "right", render: (i) => `${(i.share * 100).toFixed(1)}%`, sortValue: (i) => i.share },
          ]}
        />
      </Card>
      <Card title="Not sold this period" sub="On the menu but no sales in the chosen dates — candidates to promote, rework or remove.">
        {insights.slowMovers.length === 0 ? (
          <p className="py-4 text-center text-sm text-neutral-400">Every menu item sold at least once.</p>
        ) : (
          <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {insights.slowMovers.map((d) => (
              <div key={`${d.category}-${d.name}`} className="flex justify-between gap-3 border-b border-neutral-100 py-1.5 text-sm">
                <span className="truncate text-neutral-700">
                  {d.name}
                  {d.outOfStock && <span className="ml-1.5 text-xs text-rose-500">sold out</span>}
                </span>
                <span className="shrink-0 text-xs text-neutral-400">
                  {d.category} · {money(d.price)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

export function DiscountsTab({ insights, currencySymbol }: { insights: ReportInsights; currencySymbol: string }) {
  const money: Money = (n) => formatMoney(n, currencySymbol);
  const d = insights.discounts;
  const couponTotal = d.coupons.reduce((s, c) => s + c.amount, 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total discounts" value={money(insights.kpis.current.discounts)} sub={`${d.discountedOrders} orders`} />
        <Stat label="Coupons" value={money(couponTotal)} sub={`${d.coupons.reduce((s, c) => s + c.uses, 0)} uses`} />
        <Stat label="Till discounts" value={money(d.extraAmount)} sub={`${d.extraCount} orders`} />
        <Stat
          label="Share of sales"
          value={`${insights.kpis.current.netSales ? ((insights.kpis.current.discounts / (insights.kpis.current.netSales + insights.kpis.current.discounts)) * 100).toFixed(1) : "0.0"}%`}
          sub="of sales before discounts"
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Coupons used">
          <SortableTable
            rows={d.coupons}
            rowKey={(c) => c.code}
            defaultSortKey="amount"
            emptyMessage="No coupons used."
            columns={[
              { key: "code", label: "Code", render: (c) => <span className="font-mono">{c.code}</span> },
              { key: "uses", label: "Uses", align: "right", render: (c) => c.uses, sortValue: (c) => c.uses },
              { key: "amount", label: "Discount", align: "right", render: (c) => money(c.amount), sortValue: (c) => c.amount },
              { key: "sales", label: "Order sales", align: "right", render: (c) => money(c.sales), sortValue: (c) => c.sales },
            ]}
          />
        </Card>
        <Card title="Discounts by staff" sub="Coupons and till discounts on each person's orders">
          <SortableTable
            rows={d.byStaff}
            rowKey={(s) => s.name}
            defaultSortKey="amount"
            emptyMessage="No discounts given."
            columns={[
              { key: "name", label: "Staff", render: (s) => s.name },
              { key: "count", label: "Orders", align: "right", render: (s) => s.count, sortValue: (s) => s.count },
              { key: "amount", label: "Discount", align: "right", render: (s) => money(s.amount), sortValue: (s) => s.amount },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}

export function VoidsTab({ insights, currencySymbol }: { insights: ReportInsights; currencySymbol: string }) {
  const money: Money = (n) => formatMoney(n, currencySymbol);
  const v = insights.voids;
  const c = insights.kpis.current;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Voided orders" value={String(c.voidCount)} />
        <Stat label="Value voided" value={money(c.voidAmount)} />
        <Stat label="Void rate" value={`${c.orders + c.voidCount ? ((c.voidCount / (c.orders + c.voidCount)) * 100).toFixed(1) : "0.0"}%`} sub="of all orders" />
        <Stat label="Most common reason" value={v.byReason[0]?.name ?? "—"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="By reason">
          <BarList rows={v.byReason.map((r) => ({ label: r.name, value: r.amount, extra: `${r.count}×` }))} money={money} />
        </Card>
        <Card title="By staff">
          <BarList rows={v.byStaff.map((r) => ({ label: r.name, value: r.amount, extra: `${r.count}×` }))} money={money} />
        </Card>
      </div>
      <Card title="Every voided order">
        <SortableTable
          rows={v.list}
          rowKey={(o) => o.id}
          defaultSortKey="time"
          emptyMessage="No voided orders."
          columns={[
            { key: "time", label: "When", render: (o) => formatOrderTimestamp(o.createdAt), sortValue: (o) => o.createdAt },
            { key: "order", label: "Order", render: (o) => `#${o.orderNumber} · ${orderSequence(o.orderNumber)}` },
            { key: "channel", label: "Type", render: (o) => o.channel },
            { key: "staff", label: "Staff", render: (o) => o.staff, sortValue: (o) => o.staff },
            { key: "reason", label: "Reason", render: (o) => o.reason },
            { key: "amount", label: "Amount", align: "right", render: (o) => money(o.amount), sortValue: (o) => o.amount },
          ]}
        />
      </Card>
    </div>
  );
}

export function TaxTab({ insights, currencySymbol }: { insights: ReportInsights; currencySymbol: string }) {
  const money: Money = (n) => formatMoney(n, currencySymbol);
  const totalNet = insights.tax.reduce((s, t) => s + t.net, 0);
  const totalTax = insights.tax.reduce((s, t) => s + t.tax, 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Sales before tax" value={money(totalNet)} sub="after discounts" />
        <Stat label="Tax collected" value={money(totalTax)} />
        <Stat label="Sales including tax" value={money(totalNet + totalTax)} />
      </div>
      <Card title="Tax by rate" sub="Each item is taxed at the rate its category had when it was ordered. 0% means no tax was charged (tax off, or a zero-rated category).">
        <SortableTable
          rows={insights.tax}
          rowKey={(t) => String(t.rate)}
          defaultSortKey="rate"
          emptyMessage="No sales in this period."
          columns={[
            { key: "rate", label: "Rate", render: (t) => `${t.rate}%`, sortValue: (t) => t.rate },
            { key: "net", label: "Sales before tax", align: "right", render: (t) => money(t.net), sortValue: (t) => t.net },
            { key: "tax", label: "Tax", align: "right", render: (t) => money(t.tax), sortValue: (t) => t.tax },
            { key: "gross", label: "Including tax", align: "right", render: (t) => money(t.net + t.tax), sortValue: (t) => t.net + t.tax },
          ]}
        />
      </Card>
    </div>
  );
}

export function CustomersTab({ insights, currencySymbol }: { insights: ReportInsights; currencySymbol: string }) {
  const money: Money = (n) => formatMoney(n, currencySymbol);
  const cu = insights.customers;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Known customers" value={String(cu.identified)} sub="with a phone, email or loyalty card" />
        <Stat label="Came back" value={String(cu.repeat)} sub={cu.identified ? `${((cu.repeat / cu.identified) * 100).toFixed(0)}% ordered more than once` : undefined} />
        <Stat label="Loyalty orders" value={String(cu.loyaltyOrders)} sub={money(cu.loyaltySales)} />
        <Stat label="Loyalty members" value={String(cu.totalMembers)} sub={`${cu.newMembers} joined this period`} />
      </div>
      <Card title="Top customers" sub="By spend in the chosen dates">
        <SortableTable
          rows={cu.top}
          rowKey={(c) => c.contact}
          defaultSortKey="spend"
          emptyMessage="No customers with contact details in this period."
          columns={[
            { key: "name", label: "Name", render: (c) => c.name },
            { key: "contact", label: "Phone / email", render: (c) => c.contact },
            { key: "orders", label: "Orders", align: "right", render: (c) => c.orders, sortValue: (c) => c.orders },
            { key: "spend", label: "Spend", align: "right", render: (c) => money(c.spend), sortValue: (c) => c.spend },
            { key: "last", label: "Last order", align: "right", render: (c) => formatOrderTimestamp(c.last), sortValue: (c) => c.last },
          ]}
        />
      </Card>
    </div>
  );
}

export function TablesTab({ insights, currencySymbol }: { insights: ReportInsights; currencySymbol: string }) {
  const money: Money = (n) => formatMoney(n, currencySymbol);
  const t = insights.tables;
  const timed = t.filter((x) => x.avgMinutes !== null);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Tables used" value={String(t.length)} />
        <Stat label="Table orders" value={String(t.reduce((s, x) => s + x.orders, 0))} />
        <Stat label="Spend per cover" value={money(t.reduce((s, x) => s + x.revenue, 0) / Math.max(1, t.reduce((s, x) => s + x.guests, 0)))} />
        <Stat
          label="Average sitting"
          value={timed.length ? `${(timed.reduce((s, x) => s + (x.avgMinutes ?? 0), 0) / timed.length).toFixed(0)} min` : "—"}
          sub="order placed → paid & served"
        />
      </div>
      <Card title="Each table">
        <SortableTable
          rows={t}
          rowKey={(x) => String(x.table)}
          defaultSortKey="revenue"
          emptyMessage="No table orders in this period."
          columns={[
            { key: "table", label: "Table", render: (x) => `Table ${String(x.table).padStart(2, "0")}`, sortValue: (x) => x.table },
            { key: "orders", label: "Orders", align: "right", render: (x) => x.orders, sortValue: (x) => x.orders },
            { key: "guests", label: "Guests", align: "right", render: (x) => x.guests, sortValue: (x) => x.guests },
            { key: "revenue", label: "Sales", align: "right", render: (x) => money(x.revenue), sortValue: (x) => x.revenue },
            { key: "avg", label: "Per order", align: "right", render: (x) => money(x.avgSpend), sortValue: (x) => x.avgSpend },
            { key: "cover", label: "Per cover", align: "right", render: (x) => money(x.perCover), sortValue: (x) => x.perCover },
            { key: "time", label: "Avg sitting", align: "right", render: (x) => (x.avgMinutes === null ? "—" : `${x.avgMinutes.toFixed(0)} min`), sortValue: (x) => x.avgMinutes ?? -1 },
          ]}
        />
      </Card>
    </div>
  );
}

export function SpeedTab({ insights }: { insights: ReportInsights }) {
  const s = insights.speed;
  const min = (n: number) => (s.count ? `${n.toFixed(0)} min` : "—");
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Orders timed" value={String(s.count)} sub="placed → marked served" />
        <Stat label="Typical (median)" value={min(s.median)} />
        <Stat label="Average" value={min(s.avg)} />
        <Stat label="Slowest 10% take" value={min(s.p90)} sub="or longer" />
      </div>
      <Card title="By order type" sub="Orders left open over 6 hours are left out — they were forgotten, not slow.">
        <SortableTable
          rows={s.byChannel}
          rowKey={(c) => c.channel}
          defaultSortKey="count"
          emptyMessage="No served orders in this period."
          columns={[
            { key: "channel", label: "Type", render: (c) => c.channel },
            { key: "count", label: "Orders", align: "right", render: (c) => c.count, sortValue: (c) => c.count },
            { key: "median", label: "Median", align: "right", render: (c) => `${c.median.toFixed(0)} min`, sortValue: (c) => c.median },
            { key: "avg", label: "Average", align: "right", render: (c) => `${c.avg.toFixed(0)} min`, sortValue: (c) => c.avg },
            { key: "p90", label: "Slowest 10%", align: "right", render: (c) => `${c.p90.toFixed(0)} min`, sortValue: (c) => c.p90 },
          ]}
        />
      </Card>
    </div>
  );
}

export function EndDayTab({ insights, currencySymbol }: { insights: ReportInsights; currencySymbol: string }) {
  const money: Money = (n) => formatMoney(n, currencySymbol);
  const e = insights.endDays;
  const unbalanced = e.filter((x) => Math.abs(x.difference) >= 0.01);
  const net = e.reduce((s, x) => s + x.difference, 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Days closed" value={String(e.length)} />
        <Stat label="Didn't balance" value={String(unbalanced.length)} />
        <Stat label="Net over / short" value={money(net)} sub="counted minus POS, all days" />
        <Stat label="Counted in total" value={money(e.reduce((s, x) => s + x.counted, 0))} />
      </div>
      <Card title="End Day reports" sub="Fix a count or delete a report in Sales Records." action={<Link href="/sales-records" className="text-xs font-semibold text-teal-700 hover:underline">Sales Records</Link>}>
        <SortableTable
          rows={e}
          rowKey={(x) => x.id}
          defaultSortKey="closed"
          emptyMessage="No End Day reports closed in this period."
          columns={[
            { key: "closed", label: "Closed", render: (x) => formatOrderTimestamp(x.closedAt), sortValue: (x) => x.closedAt },
            { key: "by", label: "By", render: (x) => x.closedBy },
            { key: "orders", label: "Orders", align: "right", render: (x) => x.orders, sortValue: (x) => x.orders },
            { key: "pos", label: "POS", align: "right", render: (x) => money(x.pos), sortValue: (x) => x.pos },
            { key: "counted", label: "Counted", align: "right", render: (x) => money(x.counted), sortValue: (x) => x.counted },
            {
              key: "diff",
              label: "Difference",
              align: "right",
              render: (x) => (
                <span className={Math.abs(x.difference) < 0.01 ? "font-semibold text-emerald-600" : "font-semibold text-rose-600"}>
                  {Math.abs(x.difference) < 0.01 ? "Balanced" : money(x.difference)}
                </span>
              ),
              sortValue: (x) => x.difference,
            },
            {
              key: "view",
              label: "",
              align: "right",
              render: (x) => (
                <Link href={`/shift-report/${x.id}`} className="text-xs font-semibold text-teal-700 hover:underline">
                  View
                </Link>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}

export function StockTab({ insights }: { insights: ReportInsights }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Stock items" value={String(insights.stockAll.length)} />
        <Stat label="Running low" value={String(insights.lowStock.length)} sub="at or below their low-stock level" />
      </div>
      <Card title="Stock levels" sub="Today's levels (not limited to the chosen dates). Manage them in Inventory." action={<Link href="/inventory" className="text-xs font-semibold text-teal-700 hover:underline">Inventory</Link>}>
        <SortableTable
          rows={insights.stockAll}
          rowKey={(s) => s.name}
          defaultSortKey="qty"
          emptyMessage="No stock items set up yet."
          columns={[
            { key: "name", label: "Item", render: (s) => s.name },
            { key: "qty", label: "In stock", align: "right", render: (s) => `${s.quantity} ${s.unit}`, sortValue: (s) => s.quantity },
            { key: "threshold", label: "Low at", align: "right", render: (s) => `${s.threshold} ${s.unit}`, sortValue: (s) => s.threshold },
            {
              key: "status",
              label: "Status",
              align: "right",
              render: (s) => <span className={s.low ? "font-semibold text-rose-600" : "text-emerald-600"}>{s.low ? "Low" : "OK"}</span>,
              sortValue: (s) => (s.low ? 0 : 1),
            },
          ]}
        />
      </Card>
    </div>
  );
}

export function StaffPerformance({ insights, currencySymbol }: { insights: ReportInsights; currencySymbol: string }) {
  const money: Money = (n) => formatMoney(n, currencySymbol);
  return (
    <Card title="Staff performance" sub="Orders each person put through in the chosen dates">
      <SortableTable
        rows={insights.staff}
        rowKey={(s) => s.name}
        defaultSortKey="revenue"
        emptyMessage="No orders in this period."
        columns={[
          { key: "name", label: "Staff", render: (s) => s.name },
          { key: "orders", label: "Orders", align: "right", render: (s) => s.orders, sortValue: (s) => s.orders },
          { key: "revenue", label: "Sales", align: "right", render: (s) => money(s.revenue), sortValue: (s) => s.revenue },
          { key: "avg", label: "Per order", align: "right", render: (s) => money(s.avg), sortValue: (s) => s.avg },
          { key: "guests", label: "Guests", align: "right", render: (s) => s.guests, sortValue: (s) => s.guests },
          { key: "discounts", label: "Discounts", align: "right", render: (s) => money(s.discounts), sortValue: (s) => s.discounts },
          { key: "voids", label: "Voids", align: "right", render: (s) => s.voids, sortValue: (s) => s.voids },
        ]}
      />
    </Card>
  );
}

// Every order in the chosen dates as a CSV file — one row per order, for the accountant or a
// spreadsheet. Built in the browser from the orders the page already has.
export function downloadOrdersCsv(orders: Order[], restaurantName: string, fromStr: string, toStr: string) {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["Date", "Time", "Order", "Seq", "Type", "Table", "Guests", "Staff", "Customer", "Items", "Subtotal", "Discount", "Tax", "Total", "Payment", "Status", "Void reason"];
  const rows = [...orders]
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((o) => {
      const b = orderBreakdown(o);
      const d = new Date(o.createdAt);
      const pay = o.payments?.length ? o.payments.map((p) => `${p.method} ${p.amount.toFixed(2)}`).join(" + ") : (o.paymentMethod ?? "Unpaid");
      return [
        d.toLocaleDateString("en-GB"),
        d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
        o.orderNumber,
        orderSequence(o.orderNumber),
        o.channel === "Third Party" && o.thirdPartyProvider ? o.thirdPartyProvider : o.channel,
        o.tableNumber ?? "",
        o.guests,
        o.createdByName ?? "",
        o.customerName ?? "",
        o.items.map((i) => `${i.qty}x ${i.name}`).join("; "),
        b.subtotal.toFixed(2),
        b.discount.toFixed(2),
        b.tax.toFixed(2),
        b.total.toFixed(2),
        pay,
        o.status,
        o.voidReason ?? "",
      ];
    });
  const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${restaurantName.replace(/[^\w]+/g, "-").toLowerCase()}-orders-${fromStr}-to-${toStr}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

