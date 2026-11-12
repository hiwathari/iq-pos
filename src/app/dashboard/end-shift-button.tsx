"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { endShiftAction } from "@/lib/actions/shifts";
import { sendPrintJob } from "@/lib/print-queue";
import { buildShiftReportHex } from "@/lib/shift-ticket";
import { formatMoney, shiftTotals, type Shift } from "@/lib/types";
import { CheckCircle2, ClipboardCheck, Printer, X } from "lucide-react";

// End Day Closing. Used on the Dashboard (opens the report page afterwards) and on the full Till
// (stays on the Till, shows a "Day closed" box). Either way, once the day is closed the report is
// sent to the receipt printer when this device has one set up (Settings → Printers → Till receipt
// printer).
export function EndShiftButton({
  currencySymbol,
  terminalNames,
  restaurantName = "",
  printTarget = null,
  stayOnPage = false,
  canViewReport = true,
  controlledOpen,
  onControlledClose,
}: {
  currencySymbol: string;
  terminalNames: string[];
  restaurantName?: string;
  printTarget?: { ip: string; port: number | null } | null;
  // On the Till: don't navigate away — show the result in a box.
  stayOnPage?: boolean;
  // Till (PIN) logins can't open the report page, only the printed copy.
  canViewReport?: boolean;
  // When set, the trigger button is not drawn: the parent (a menu) opens and closes it.
  controlledOpen?: boolean;
  onControlledClose?: () => void;
}) {
  const router = useRouter();
  const [ownOpen, setOpen] = useState(false);
  const open = controlledOpen ?? ownOpen;
  const closeForm = () => (onControlledClose ? onControlledClose() : setOpen(false));
  const [done, setDone] = useState<{ shift: Shift; printed: "sent" | "failed" | "none"; error?: string } | null>(null);
  const [printing, setPrinting] = useState(false);
  const [cashCounted, setCashCounted] = useState("");
  const [terminalAmounts, setTerminalAmounts] = useState<Record<string, string>>({});
  const [cashExpenses, setCashExpenses] = useState("");
  const [cardExpenses, setCardExpenses] = useState("");
  const [envelopeCash, setEnvelopeCash] = useState("");
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
        envelopeCash: Math.max(0, Number(envelopeCash) || 0),
        notes,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      closeForm();
      setCashCounted("");
      setTerminalAmounts({});
      setCashExpenses("");
      setCardExpenses("");
      setEnvelopeCash("");
      setNotes("");
      const shift = result.shift;
      // Print the report as soon as the day is closed.
      let printed: "sent" | "failed" | "none" = "none";
      let printError: string | undefined;
      if (shift && printTarget) {
        const job = await printShift(shift);
        printed = job.status;
        printError = job.error;
      }
      if (stayOnPage && shift) {
        setDone({ shift, printed, error: printError });
        router.refresh();
      } else {
        router.push(`/shift-report/${result.shiftId}`);
      }
    });
  }

  function printShift(shift: Shift) {
    return sendPrintJob({
      printer: "Receipt printer",
      ip: printTarget!.ip,
      port: printTarget!.port,
      label: "End Day report",
      hex: buildShiftReportHex({ restaurantName, currencySymbol, shift }),
    });
  }

  async function printAgain() {
    if (!done || !printTarget) return;
    setPrinting(true);
    const job = await printShift(done.shift);
    setDone({ ...done, printed: job.status, error: job.error });
    setPrinting(false);
  }

  return (
    <>
      {controlledOpen === undefined && (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800"
        >
          <ClipboardCheck className="h-4 w-4" /> End Day
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-neutral-900">End Day Closing</h2>
              <button onClick={closeForm} className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-4 text-xs text-neutral-400">
              Closes out sales since the last day-end and generates a report comparing what you counted against what
              the system expects.{printTarget ? " The report prints on the receipt printer when you close the day." : " Print it, save as a PDF, and share with the owners."}
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

            <label className="mb-1 block text-xs font-semibold text-neutral-500">Envelope Cash ({currencySymbol})</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={envelopeCash}
              onChange={(e) => setEnvelopeCash(e.target.value)}
              placeholder="0.00"
              className="mb-1 w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm focus:border-teal-500 focus:outline-none"
            />
            <p className="mb-3 text-xs text-neutral-400">
              Cash taken out of the till today and set aside (an owner draw, or kept aside for cash needs) —
              subtracted from what&apos;s expected, same as an expense, and added to the running Envelope Cash
              balance on the Dashboard.
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
      {done && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
            <h2 className="mt-3 text-lg font-bold text-neutral-900">Day closed</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Total taken {formatMoney(shiftTotals(done.shift).finalTotal, currencySymbol)} · {done.shift.orderCount} order{done.shift.orderCount === 1 ? "" : "s"}
            </p>
            {done.printed === "sent" && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">The report was sent to the printer.</p>}
            {done.printed === "failed" && (
              <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">The report didn&rsquo;t print{done.error ? ` — ${done.error}` : ""}. Check the printer and try again.</p>
            )}
            {done.printed === "none" && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">No receipt printer is set up on this till, so nothing was printed.</p>
            )}
            <div className="mt-5 flex flex-col gap-2">
              {printTarget && (
                <button onClick={printAgain} disabled={printing} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">
                  <Printer className="h-4 w-4" /> {printing ? "Printing…" : "Print again"}
                </button>
              )}
              {canViewReport && (
                <Link href={`/shift-report/${done.shift.id}`} className="flex min-h-11 items-center justify-center rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">
                  View full report
                </Link>
              )}
              <button onClick={() => setDone(null)} className="min-h-11 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-bold text-white hover:bg-[var(--brand-dark)]">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

