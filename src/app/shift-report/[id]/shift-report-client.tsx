"use client";

import Link from "next/link";
import { useState } from "react";
import { formatMoney, formatOrderTimestamp, shiftTotals, type Shift } from "@/lib/types";
import { brandCssVars } from "@/lib/color";
import { ArrowLeft, Printer, Share2, ChefHat } from "lucide-react";

export function ShiftReportClient({
  shift,
  restaurantName,
  currencySymbol,
  brandColor,
}: {
  shift: Shift;
  restaurantName: string;
  currencySymbol: string;
  brandColor?: string | null;
}) {
  const [shared, setShared] = useState(false);
  const variance = shift.cashCounted - shift.expectedCash;
  const isBalanced = Math.abs(variance) < 0.01;
  const totals = shiftTotals(shift);
  // Every card machine that either had sales or got a manager-entered count — so a terminal the
  // manager counted money for still shows up (and reconciles against zero) even on a slow shift.
  // Cash is its own row (counted as the drawer, not a terminal entry).
  const terminalMethods = [
    ...new Set([...(shift.terminalSales ?? []).map((t) => t.method), ...(shift.terminalCounts ?? []).map((c) => c.method)]),
  ].filter((m) => m !== "Cash");
  const takingsRows = [
    { method: "Cash", counted: totals.cashTaken, pos: shift.cashSales },
    ...terminalMethods.map((method) => ({
      method,
      counted: shift.terminalCounts?.find((c) => c.method === method)?.counted ?? 0,
      pos: shift.terminalSales?.find((t) => t.method === method)?.amount ?? 0,
    })),
  ];

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${restaurantName} — Shift Report`, url });
        return;
      } catch {
        // User cancelled the share sheet — fall through to clipboard copy.
      }
    }
    await navigator.clipboard.writeText(url).catch(() => {});
    setShared(true);
    setTimeout(() => setShared(false), 2000);
  }

  return (
    <div className="mx-auto min-h-dvh max-w-2xl bg-white px-6 py-8 print:p-0" style={brandCssVars(brandColor)}>
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link href="/dashboard" className="flex items-center gap-1.5 text-sm font-medium text-neutral-500 hover:text-neutral-800">
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={share}
            className="flex items-center gap-1.5 rounded-xl border border-neutral-200 px-3.5 py-2 text-sm font-semibold text-neutral-600 hover:bg-neutral-50"
          >
            <Share2 className="h-4 w-4" /> {shared ? "Link Copied!" : "Share"}
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-xl bg-[var(--brand)] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]"
          >
            <Printer className="h-4 w-4" /> Print / Save as PDF
          </button>
        </div>
      </div>

      <div className="mb-8 flex items-center justify-between border-b-2 border-neutral-900 pb-4">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold text-neutral-900">
            <ChefHat className="h-5 w-5 text-teal-600" /> {restaurantName}
          </div>
          <div className="mt-1 text-sm text-neutral-500">Shift Report</div>
        </div>
        <div className="text-right text-xs text-neutral-400">
          <div>Closed by {shift.closedByName ?? "—"}</div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 rounded-2xl bg-neutral-50 p-4 text-sm">
        <div>
          <div className="text-neutral-400">Shift Start</div>
          <div className="font-semibold text-neutral-800">{formatOrderTimestamp(shift.openedAt)}</div>
        </div>
        <div>
          <div className="text-neutral-400">Shift End</div>
          <div className="font-semibold text-neutral-800">{formatOrderTimestamp(shift.closedAt)}</div>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border-2 border-neutral-900 p-5 text-center">
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Total Taken</div>
        <div className="mt-1 text-4xl font-extrabold text-neutral-900">{formatMoney(totals.finalTotal, currencySymbol)}</div>
        <div className="mt-1 text-sm text-neutral-600">
          Cash {formatMoney(totals.cashTaken, currencySymbol)} · Card machines {formatMoney(totals.cardTaken, currencySymbol)}
        </div>
        <div className="mt-2 text-xs text-neutral-400">
          POS recorded {formatMoney(totals.posTotal, currencySymbol)} ·{" "}
          <Difference value={totals.difference} currencySymbol={currencySymbol} />
        </div>
        <div className="mt-1 text-xs text-neutral-400">
          {shift.orderCount} order{shift.orderCount === 1 ? "" : "s"}
          {shift.voidCount > 0 ? ` · ${shift.voidCount} voided (${formatMoney(shift.voidAmount, currencySymbol)})` : ""}
        </div>
      </div>

      <h2 className="mb-2 text-sm font-bold text-neutral-900">Takings vs POS</h2>
      <div className="mb-6 overflow-hidden rounded-xl border border-neutral-200 text-sm">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 bg-neutral-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
          <span>Method</span>
          <span className="text-right">Taken</span>
          <span className="text-right">POS</span>
          <span className="w-24 text-right">Difference</span>
        </div>
        {takingsRows.map((r) => (
          <div key={r.method} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 border-t border-neutral-100 px-4 py-3 text-neutral-600">
            <span className="truncate">{r.method}</span>
            <span className="text-right font-semibold text-neutral-900">{formatMoney(r.counted, currencySymbol)}</span>
            <span className="text-right">{formatMoney(r.pos, currencySymbol)}</span>
            <span className="w-24 text-right text-xs">
              <Difference value={r.counted - r.pos} currencySymbol={currencySymbol} />
            </span>
          </div>
        ))}
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 border-t border-neutral-200 bg-neutral-50 px-4 py-3 font-bold text-neutral-900">
          <span>Total</span>
          <span className="text-right">{formatMoney(totals.finalTotal, currencySymbol)}</span>
          <span className="text-right font-semibold text-neutral-600">{formatMoney(totals.posTotal, currencySymbol)}</span>
          <span className="w-24 text-right text-xs">
            <Difference value={totals.difference} currencySymbol={currencySymbol} />
          </span>
        </div>
        {shift.otherSales > 0 && (
          <div className="border-t border-neutral-100 px-4 py-2.5 text-xs text-neutral-400">
            Unpaid orders on the POS (not money taken, not included above): {formatMoney(shift.otherSales, currencySymbol)}
          </div>
        )}
      </div>

      <h2 className="mb-2 text-sm font-bold text-neutral-900">Cash Reconciliation</h2>
      <div className="mb-6 overflow-hidden rounded-xl border border-neutral-200">
        <Row label="Opening Balance" value={shift.openingBalance} currencySymbol={currencySymbol} />
        <Row label="Cash Sales" value={shift.cashSales} currencySymbol={currencySymbol} />
        {shift.cashExpenses > 0 && (
          <div className="flex items-center justify-between border-t border-neutral-100 px-4 py-3 text-sm text-neutral-600">
            <span>Less: Cash Expenses</span>
            <span className="font-semibold text-neutral-800">-{formatMoney(shift.cashExpenses, currencySymbol)}</span>
          </div>
        )}
        {shift.envelopeCash > 0 && (
          <div className="flex items-center justify-between border-t border-neutral-100 px-4 py-3 text-sm text-neutral-600">
            <span>Less: Envelope Cash</span>
            <span className="font-semibold text-neutral-800">-{formatMoney(shift.envelopeCash, currencySymbol)}</span>
          </div>
        )}
        <Row label="Expected Cash in Till" value={shift.expectedCash} currencySymbol={currencySymbol} />
        <Row label="Cash Counted in Till" value={shift.cashCounted} currencySymbol={currencySymbol} />
        <div className={`flex items-center justify-between px-4 py-3 text-sm font-bold ${isBalanced ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
          <span>{isBalanced ? "Balanced" : variance > 0 ? "Over by" : "Short by"}</span>
          <span>{formatMoney(Math.abs(variance), currencySymbol)}</span>
        </div>
      </div>

      {shift.cardExpenses > 0 && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-neutral-200 px-4 py-3 text-sm">
          <span className="text-neutral-600">Card Expenses</span>
          <span className="font-semibold text-neutral-800">{formatMoney(shift.cardExpenses, currencySymbol)}</span>
        </div>
      )}

      {shift.notes && (
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-bold text-neutral-900">Notes</h2>
          <p className="rounded-xl bg-neutral-50 p-3.5 text-sm text-neutral-600">{shift.notes}</p>
        </div>
      )}

      <div className="mt-10 border-t border-neutral-200 pt-4 text-center text-xs text-neutral-400">
        Generated by IQ POS · {restaurantName}
      </div>

      <style>{`
        @media print {
          @page { margin: 16mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}

function Difference({ value, currencySymbol }: { value: number; currencySymbol: string }) {
  if (Math.abs(value) < 0.01) return <span className="font-semibold text-emerald-600">Matches</span>;
  return (
    <span className={`font-semibold ${value > 0 ? "text-emerald-600" : "text-rose-600"}`}>
      {value > 0 ? "Over" : "Short"} {formatMoney(Math.abs(value), currencySymbol)}
    </span>
  );
}

function Row({
  label,
  value,
  currencySymbol,
  emphasize,
}: {
  label: string;
  value: number;
  currencySymbol: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between border-t border-neutral-100 px-4 py-3 text-sm first:border-t-0 ${
        emphasize ? "bg-neutral-50 font-bold text-neutral-900" : "text-neutral-600"
      }`}
    >
      <span>{label}</span>
      <span className={emphasize ? "" : "font-semibold text-neutral-800"}>{formatMoney(value, currencySymbol)}</span>
    </div>
  );
}
