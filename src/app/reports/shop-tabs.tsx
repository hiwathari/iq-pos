"use client";

import { Download } from "lucide-react";
import { downloadCsv, toCsv } from "@/lib/csv";
import { formatMoney } from "@/lib/types";
import type { ShopCell, ShopColumn, ShopKpi, ShopReport, ShopTable } from "@/lib/data/shop-reports";
import { SortableTable, type Column } from "./sortable-table";

// The shop reports (Reports → Shop group): headline figures plus tables that sort on a header
// click and export to CSV. The server (lib/data/shop-reports.ts) sends plain numbers; this turns
// them into money, percentages and dates.

function formatCell(v: ShopCell, type: ShopColumn["type"], symbol: string, timezone: string) {
  if (v === null || v === undefined || v === "") return "–";
  if (type === "money") return formatMoney(Number(v), symbol);
  if (type === "pct") return `${(Number(v) * 100).toFixed(1)}%`;
  if (type === "date") return new Date(Number(v)).toLocaleString("en-GB", { timeZone: timezone, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  if (type === "qty") return String(Math.round(Number(v) * 1000) / 1000);
  return String(v);
}

// What goes in the CSV: raw numbers for money / quantities (so a spreadsheet can add them up),
// readable text for dates and percentages.
function csvCell(v: ShopCell, type: ShopColumn["type"], timezone: string) {
  if (v === null || v === undefined) return "";
  if (type === "pct") return (Number(v) * 100).toFixed(1) + "%";
  if (type === "date") return new Date(Number(v)).toLocaleString("en-GB", { timeZone: timezone });
  return v;
}

function KpiCard({ k, symbol }: { k: ShopKpi; symbol: string }) {
  const shown = typeof k.value === "string" ? k.value : formatCell(k.value, k.type, symbol, "UTC");
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-neutral-400">{k.label}</div>
      <div className={`mt-1 text-xl font-bold ${k.warn ? "text-amber-600" : "text-neutral-900"}`}>{shown}</div>
      {k.hint && <div className="mt-0.5 text-xs text-neutral-400">{k.hint}</div>}
    </div>
  );
}

function ReportTable({ table, symbol, timezone, filename }: { table: ShopTable; symbol: string; timezone: string; filename: string }) {
  const columns: Column<Record<string, ShopCell>>[] = table.columns.map((c, i) => ({
    key: c.key,
    label: c.label,
    align: i === 0 || c.type === "text" ? "left" : "right",
    render: (row) => formatCell(row[c.key] ?? null, c.type, symbol, timezone),
    sortValue: (row) => {
      const v = row[c.key];
      return v === null || v === undefined ? (c.type === "text" ? "" : -Infinity) : v;
    },
  }));
  function exportCsv() {
    downloadCsv(
      `${filename}.csv`,
      toCsv(
        table.columns.map((c) => c.label),
        table.rows.map((r) => table.columns.map((c) => csvCell(r[c.key] ?? null, c.type, timezone)))
      )
    );
  }
  return (
    <div className="mb-8">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-neutral-700">{table.title ?? ""}</h2>
        {table.rows.length > 0 && (
          <button onClick={exportCsv} className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-50 print:hidden">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        )}
      </div>
      <SortableTable columns={columns} rows={table.rows} rowKey={(r) => JSON.stringify(r)} emptyMessage={table.empty ?? "Nothing to show."} />
    </div>
  );
}

const MARGIN_BY = [
  { key: "product", label: "By product" },
  { key: "category", label: "By category" },
  { key: "supplier", label: "By supplier" },
  { key: "staff", label: "By staff" },
];

export function ShopReportTab({
  tab,
  report,
  currencySymbol,
  timezone,
  by,
  fromStr,
  toStr,
}: {
  tab: string;
  report: ShopReport;
  currencySymbol: string;
  timezone: string;
  by: string;
  fromStr: string;
  toStr: string;
}) {
  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-neutral-900">{report.title}</h2>
      {report.note && <p className="mb-4 max-w-3xl text-sm text-neutral-500">{report.note}</p>}

      {tab === "margin" && (
        <div className="mb-4 flex flex-wrap gap-1 print:hidden">
          {MARGIN_BY.map((o) => (
            <a
              key={o.key}
              href={`/reports?tab=margin&from=${fromStr}&to=${toStr}&by=${o.key}`}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${by === o.key ? "bg-neutral-900 text-white" : "text-neutral-500 hover:bg-neutral-100"}`}
            >
              {o.label}
            </a>
          ))}
        </div>
      )}

      {report.kpis && report.kpis.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {report.kpis.map((k) => (
            <KpiCard key={k.label} k={k} symbol={currencySymbol} />
          ))}
        </div>
      )}

      {report.tables.map((t, i) => (
        <ReportTable key={i} table={t} symbol={currencySymbol} timezone={timezone} filename={`${tab}${t.title ? "-" + t.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") : ""}-${fromStr}-to-${toStr}`} />
      ))}
    </div>
  );
}
