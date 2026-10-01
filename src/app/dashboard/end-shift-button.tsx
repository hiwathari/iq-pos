"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { endShiftAction, previewShiftSummaryAction, type ShiftPreview } from "@/lib/actions/shifts";
import { formatMoney, formatOrderTimestamp } from "@/lib/types";
import { DenominationInput, denominationTotal, type DenominationCounts } from "@/components/denomination-input";
import { ClipboardCheck, X, AlertTriangle, Receipt } from "lucide-react";

export function EndShiftButton({
  currencySymbol,
  terminalNames,
}: {
  currencySymbol: string;
  terminalNames: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ShiftPreview | null>(null);
  const [cashCounts, setCashCounts] = useState<DenominationCounts>({});
  const [terminalAmounts, setTerminalAmounts] = useState<Record<string, string>>({});
  const [cashExpenses, setCashExpenses] = useState("");
  const [cardExpenses, setCardExpenses] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadingPreview, startLoadingPreview] = useTransition();
  const [submitting, startSubmit] = useTransition();

  function openModal() {
    setOpen(true);
    setError(null);
    startLoadingPreview(async () => {
      const result = await previewShiftSummaryAction();
      setPreview(result);
    });
  }

  function close() {
    setOpen(false);
    setPreview(null);
    setCashCounts({});
    setTerminalAmounts({});
    setCashExpenses("");
    setCardExpenses("");
    setNotes("");
    setError(null);
  }

  const cashCounted = denominationTotal(cashCounts);
  const cashExpensesNum = Math.max(0, Number(cashExpenses) || 0);
  const expectedCash = preview ? preview.openingBalance + preview.cashSales - cashExpensesNum : 0;
  const cashVariance = cashCounted - expectedCash;

  function submit() {
    if (!preview) return;
    setError(null);
    const terminalCounts = terminalNames.map((method) => ({
      method,
      counted: Math.max(0, Number(terminalAmounts[method]) || 0),
    }));
    startSubmit(async () => {
      const result = await endShiftAction({
        cashCounted,
        terminalCounts,
        cashExpenses: cashExpensesNum,
        cardExpenses: Math.max(0, Number(cardExpenses) || 0),
        notes,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      close();
      router.push(`/shift-report/${result.shiftId}`);
    });
  }

  return (
    <>
      <button
        onClick={openModal}
        className="flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800"
      >
        <ClipboardCheck className="h-4 w-4" /> Report & End Day
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-neutral-900">End Day Closing</h2>
              <button onClick={close} className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            {loadingPreview || !preview ? (
              <p className="py-8 text-center text-sm text-neutral-400">Loading today&apos;s numbers…</p>
            ) : (
              <>
                <p className="mb-4 text-xs text-neutral-400">
                  Since {formatOrderTimestamp(preview.sinceTs)}. Nothing is saved until you close the day at the
                  bottom — look this over, count the drawer, and fix anything flagged first.
                </p>

                {preview.issues.length > 0 && (
                  <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-amber-800">
                      <AlertTriangle className="h-3.5 w-3.5" /> Needs attention before closing
                    </div>
                    <ul className="space-y-1 text-xs text-amber-700">
                      {preview.issues.map((issue) => (
                        <li key={issue.orderId}>
                          #{issue.orderNumber}
                          {issue.tableNumber ? ` · Table ${issue.tableNumber}` : ""} — {issue.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mb-4 grid grid-cols-3 gap-2 text-center">
                  <SummaryTile label="Total Sales" value={formatMoney(preview.totalSales, currencySymbol)} />
                  <SummaryTile label="Cash Sales" value={formatMoney(preview.cashSales, currencySymbol)} />
                  <SummaryTile label="Card Sales" value={formatMoney(preview.cardSales, currencySymbol)} />
                </div>

                {preview.itemSales.length > 0 && (
                  <details className="mb-4 rounded-xl border border-neutral-200">
                    <summary className="flex cursor-pointer items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold text-neutral-600">
                      <Receipt className="h-3.5 w-3.5" /> Item-wise sales ({preview.itemSales.length})
                    </summary>
                    <div className="max-h-48 overflow-y-auto border-t border-neutral-100">
                      {preview.itemSales.map((i) => (
                        <div key={i.name} className="flex items-center justify-between border-t border-neutral-50 px-3.5 py-2 text-xs first:border-t-0">
                          <span className="text-neutral-600">
                            {i.qty}x {i.name}
                          </span>
                          <span className="font-semibold text-neutral-800">{formatMoney(i.total, currencySymbol)}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                <label className="mb-1 block text-xs font-semibold text-neutral-500">Count the Cash Drawer</label>
                <DenominationInput currencySymbol={currencySymbol} counts={cashCounts} onChange={setCashCounts} autoFocusFirst />
                <div
                  className={`mb-4 mt-2 flex items-center justify-between rounded-xl px-3.5 py-2 text-xs font-semibold ${
                    Math.abs(cashVariance) < 0.01 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                  }`}
                >
                  <span>Expected {formatMoney(expectedCash, currencySymbol)}</span>
                  <span>
                    {Math.abs(cashVariance) < 0.01
                      ? "Balanced"
                      : `${cashVariance > 0 ? "Over" : "Short"} by ${formatMoney(Math.abs(cashVariance), currencySymbol)}`}
                  </span>
                </div>

                {terminalNames.length > 0 && (
                  <>
                    <div className="mb-1 text-xs font-semibold text-neutral-500">Card Machine Totals ({currencySymbol})</div>
                    <div className="mb-4 space-y-2">
                      {terminalNames.map((name) => {
                        const expected = preview.terminalSales.find((t) => t.method === name)?.amount ?? 0;
                        const counted = Math.max(0, Number(terminalAmounts[name]) || 0);
                        const variance = counted - expected;
                        const hasInput = (terminalAmounts[name] ?? "") !== "";
                        return (
                          <div key={name}>
                            <div className="flex items-center gap-2">
                              <span className="w-24 shrink-0 truncate text-xs text-neutral-500">{name}</span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={terminalAmounts[name] ?? ""}
                                onChange={(e) => setTerminalAmounts((prev) => ({ ...prev, [name]: e.target.value }))}
                                placeholder={`Expected ${formatMoney(expected, currencySymbol)}`}
                                className="w-full rounded-xl border border-neutral-200 px-3.5 py-2 text-sm focus:border-teal-500 focus:outline-none"
                              />
                            </div>
                            {hasInput && Math.abs(variance) >= 0.01 && (
                              <p className="mt-1 text-right text-[11px] font-semibold text-rose-600">
                                {variance > 0 ? "Over" : "Short"} by {formatMoney(Math.abs(variance), currencySymbol)}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                <div className="mb-3 grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-neutral-500">Cash Expenses</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={cashExpenses}
                      onChange={(e) => setCashExpenses(e.target.value)}
                      placeholder="0.00"
                      className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm focus:border-teal-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-neutral-500">Card Expenses</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={cardExpenses}
                      onChange={(e) => setCardExpenses(e.target.value)}
                      placeholder="0.00"
                      className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm focus:border-teal-500 focus:outline-none"
                    />
                  </div>
                </div>
                <p className="mb-3 text-xs text-neutral-400">
                  Money spent out of the till or on a card during the shift (e.g. supplies, petty cash) — subtracted
                  from what&apos;s expected so the count still tallies.
                </p>

                <label className="mb-1 block text-xs font-semibold text-neutral-500">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Anything the owners should know about today"
                  className="mb-3 w-full resize-none rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm focus:border-teal-500 focus:outline-none"
                />
                {error && <p className="mb-3 text-xs font-medium text-rose-600">{error}</p>}
                <button
                  onClick={submit}
                  disabled={submitting}
                  className="w-full rounded-xl bg-[var(--brand)] py-3 text-sm font-bold text-white hover:bg-[var(--brand-dark)] disabled:opacity-50"
                >
                  {submitting ? "Closing…" : "Close Day & Generate Report"}
                </button>

                {preview.recentShifts.length > 0 && (
                  <div className="mt-4 border-t border-neutral-100 pt-3">
                    <div className="mb-1.5 text-xs font-semibold text-neutral-500">Recent Reports</div>
                    <div className="space-y-1">
                      {preview.recentShifts.map((s) => (
                        <Link
                          key={s.id}
                          href={`/shift-report/${s.id}`}
                          className="flex items-center justify-between rounded-lg px-2 py-1.5 text-xs text-neutral-500 hover:bg-neutral-50"
                        >
                          <span>{formatOrderTimestamp(s.closedAt)}</span>
                          <span className={Math.abs(s.variance) < 0.01 ? "text-emerald-600" : "text-rose-600"}>
                            {formatMoney(s.totalSales, currencySymbol)}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-neutral-50 px-2 py-2.5">
      <div className="text-xs text-neutral-400">{label}</div>
      <div className="text-sm font-bold text-neutral-900">{value}</div>
    </div>
  );
}
