"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { endShiftAction } from "@/lib/actions/shifts";
import { ClipboardCheck, X } from "lucide-react";

export function EndShiftButton({
  currencySymbol,
  terminalNames,
}: {
  currencySymbol: string;
  terminalNames: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cashCounted, setCashCounted] = useState("");
  const [terminalAmounts, setTerminalAmounts] = useState<Record<string, string>>({});
  const [cashExpenses, setCashExpenses] = useState("");
  const [cardExpenses, setCardExpenses] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    const cash = Number(cashCounted);
    if (cashCounted.trim() === "" || Number.isNaN(cash) || cash < 0) {
      setError("Enter the cash counted in the drawer.");
      return;
    }
    setError(null);
    const terminalCounts = terminalNames.map((method) => ({
      method,
      counted: Math.max(0, Number(terminalAmounts[method]) || 0),
    }));
    startTransition(async () => {
      const result = await endShiftAction({
        cashCounted: cash,
        terminalCounts,
        cashExpenses: Math.max(0, Number(cashExpenses) || 0),
        cardExpenses: Math.max(0, Number(cardExpenses) || 0),
        notes,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.push(`/shift-report/${result.shiftId}`);
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800"
      >
        <ClipboardCheck className="h-4 w-4" /> End Day
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-neutral-900">End Day Closing</h2>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-4 text-xs text-neutral-400">
              Closes out sales since the last day-end and generates a report comparing what you counted against what
              the system expects — print it, save as a PDF, and share with the owners.
            </p>

            <label className="mb-1 block text-xs font-semibold text-neutral-500">Cash Counted in Till ({currencySymbol})</label>
            <input
              type="number"
              step="0.01"
              min="0"
              autoFocus
              value={cashCounted}
              onChange={(e) => setCashCounted(e.target.value)}
              placeholder="0.00"
              className="mb-3 w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm focus:border-teal-500 focus:outline-none"
            />

            {terminalNames.length > 0 && (
              <>
                <div className="mb-1 text-xs font-semibold text-neutral-500">Card Machine Totals ({currencySymbol})</div>
                <div className="mb-3 space-y-2">
                  {terminalNames.map((name) => (
                    <div key={name} className="flex items-center gap-2">
                      <span className="w-24 shrink-0 truncate text-xs text-neutral-500">{name}</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={terminalAmounts[name] ?? ""}
                        onChange={(e) => setTerminalAmounts((prev) => ({ ...prev, [name]: e.target.value }))}
                        placeholder="0.00"
                        className="w-full rounded-xl border border-neutral-200 px-3.5 py-2 text-sm focus:border-teal-500 focus:outline-none"
                      />
                    </div>
                  ))}
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
              Money spent out of the till or on a card during the shift (e.g. supplies, petty cash) — subtracted from
              what&apos;s expected so the count still tallies.
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
              disabled={pending}
              className="w-full rounded-xl bg-[var(--brand)] py-3 text-sm font-bold text-white hover:bg-[var(--brand-dark)] disabled:opacity-50"
            >
              {pending ? "Closing…" : "Close Day & Generate Report"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

