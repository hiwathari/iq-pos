"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Printer as PrinterIcon, RotateCcw, X } from "lucide-react";
import { updateCategoryAction } from "@/lib/actions/menu";
import { LocalNetworkPrintRow } from "@/app/settings/printers-client";
import { dismissPrintJob, getPrintJobs, retryPrintJob, subscribePrintJobs, type PrintJob } from "@/lib/print-queue";
import type { Category, CategoryDisplayOverride, Printer } from "@/lib/types";

const NO_JOBS: PrintJob[] = [];
export function usePrintJobs() {
  return useSyncExternalStore(subscribePrintJobs, getPrintJobs, () => NO_JOBS);
}

// Till header button: the printer icon, red with a count when something failed to print. Tapping it
// lists what was sent (newest first) with Retry / Dismiss on the failures.
export function PrintStatusButton({ className }: { className: string }) {
  const jobs = usePrintJobs();
  const [open, setOpen] = useState(false);
  const failed = jobs.filter((j) => j.status === "failed").length;
  if (jobs.length === 0) return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={failed ? `${failed} print${failed === 1 ? "" : "s"} failed — tap to retry` : "Recent prints"}
        aria-label="Print status"
        className={`${className} ${failed ? "!border-rose-300 !bg-rose-50 !text-rose-600" : ""}`}
      >
        {failed ? <AlertTriangle className="h-4 w-4" /> : <PrinterIcon className="h-4 w-4" />}
        {failed > 0 && <span className="text-sm font-bold">{failed}</span>}
      </button>
      {open && <PrintJobsModal onClose={() => setOpen(false)} />}
    </>
  );
}

function PrintJobsModal({ onClose }: { onClose: () => void }) {
  const jobs = usePrintJobs();
  const [retrying, setRetrying] = useState<string | null>(null);
  async function retry(id: string) {
    setRetrying(id);
    await retryPrintJob(id);
    setRetrying(null);
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-bold text-neutral-900">
            <PrinterIcon className="h-5 w-5 text-neutral-500" /> Recent prints
          </h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="border-b border-neutral-100 px-5 py-2.5 text-xs text-neutral-400">
          A failed print stays here until you retry it or dismiss it. &ldquo;Sent&rdquo; means handed to the printer connection — if nothing came out, check the
          printer is on and its IP address (Printers).
        </p>
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {jobs.length === 0 && <div className="py-6 text-center text-sm text-neutral-300">Nothing printed yet.</div>}
          {jobs.map((j) => (
            <div key={j.id} className={`rounded-xl border px-3 py-2.5 ${j.status === "failed" ? "border-rose-200 bg-rose-50" : "border-neutral-200"}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-neutral-800">{j.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${j.status === "failed" ? "bg-rose-600 text-white" : "bg-emerald-100 text-emerald-700"}`}>
                  {j.status === "failed" ? "Failed" : "Sent"}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-neutral-500">
                {j.printer} · {new Date(j.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              </div>
              {j.error && <div className="mt-1 text-xs font-medium text-rose-600">{j.error}</div>}
              {j.status === "failed" && (
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => retry(j.id)}
                    disabled={retrying === j.id}
                    className="flex items-center gap-1.5 rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> {retrying === j.id ? "Trying…" : "Retry"}
                  </button>
                  <button onClick={() => dismissPrintJob(j.id)} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-white">
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// A red toast the moment a print fails, so the cashier knows right away that a ticket did not come
// out (the full list is behind the printer button).
export function PrintFailureToast() {
  const jobs = usePrintJobs();
  const [dismissedAt, setDismissedAt] = useState(0);
  const latest = jobs.find((j) => j.status === "failed");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!latest || latest.at <= dismissedAt) return;
    const show = setTimeout(() => setOpen(true), 0);
    const hide = setTimeout(() => setOpen(false), 10000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [latest, dismissedAt]);
  if (!latest || !open || latest.at <= dismissedAt) return null;
  return (
    <div role="alert" className="fixed bottom-4 right-4 z-[60] flex max-w-sm items-start gap-3 rounded-2xl border border-rose-300 bg-rose-600 px-4 py-3 text-white shadow-xl">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="text-sm">
        <div className="font-bold">Didn&rsquo;t print — {latest.printer}</div>
        <div className="opacity-90">{latest.label}. {latest.error}</div>
        <div className="mt-1 text-xs opacity-80">Open the printer button at the top to retry.</div>
      </div>
      <button
        onClick={() => {
          setOpen(false);
          setDismissedAt(latest.at);
        }}
        aria-label="Dismiss"
        className="rounded p-0.5 opacity-80 hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// Managers' printer setup from inside the Till (no need to leave for Settings): type each printer's
// IP, test it, switch on receipts / kitchen tickets, and choose which printer each category prints to.
export function PrintersPanel({ printers, categories, onClose }: { printers: Printer[]; categories: Category[]; onClose: () => void }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [savedCat, setSavedCat] = useState<string | null>(null);
  const real = printers.filter((p) => p.kind !== "display");

  function setCategoryPrinter(c: Category, printerId: string) {
    startTransition(async () => {
      await updateCategoryAction(c.id, {
        name: c.name,
        printerId: printerId || null,
        kitchenDisplayStation: (c.kitchenDisplayStation ?? null) as CategoryDisplayOverride,
        taxRatePercent: c.taxRatePercent,
      });
      setSavedCat(c.id);
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-bold text-neutral-900">
            <PrinterIcon className="h-5 w-5 text-neutral-500" /> Printers
          </h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <p className="text-sm text-neutral-500">
            Type each printer&rsquo;s IP address and press Test Print. Tick <b>Use for Till auto-print</b> on the bill printer, and <b>Print kitchen tickets here</b> on
            each kitchen or bar printer. Then choose below which printer each category prints to.
          </p>

          {real.length === 0 && (
            <div className="rounded-xl border border-dashed border-neutral-300 p-4 text-center text-sm text-neutral-400">
              No printers yet. Add one in <Link href="/settings" className="font-semibold text-[var(--brand)] underline">Settings → Printers</Link>, then come back to connect it.
            </div>
          )}
          {real.map((p) => (
            <div key={p.id} className="rounded-xl border border-neutral-200 p-3">
              <div className="font-semibold text-neutral-900">
                {p.name} <span className="text-xs font-normal text-neutral-400">· {p.station}</span>
              </div>
              <LocalNetworkPrintRow printer={p} />
            </div>
          ))}

          {real.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-bold text-neutral-800">Which printer each category prints to</h3>
              <p className="mb-2 text-xs text-neutral-400">A single product can use a different printer — set that in Manage Dishes.</p>
              <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
                {categories.map((c) => (
                  <label key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-sm font-medium text-neutral-700">{c.name}</span>
                    <span className="flex items-center gap-2">
                      {savedCat === c.id && <span className="text-xs font-semibold text-emerald-600">Saved</span>}
                      <select
                        value={c.printerId ?? ""}
                        onChange={(e) => setCategoryPrinter(c, e.target.value)}
                        aria-label={`Printer for ${c.name}`}
                        className="rounded-lg border border-neutral-200 px-2 py-1.5 text-sm text-neutral-700"
                      >
                        <option value="">No printer</option>
                        {real.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <p className="text-xs text-neutral-400">
            Prints go from this device straight to the printer. If a print fails you will see it straight away, and it stays in the printer button&rsquo;s list to retry.
          </p>
        </div>
      </div>
    </div>
  );
}
