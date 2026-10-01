"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { openTillAction } from "@/lib/actions/shifts";
import { formatMoney } from "@/lib/types";
import { DenominationInput, denominationTotal, type DenominationCounts } from "@/components/denomination-input";
import { Wallet, X } from "lucide-react";

export function OpenTillButton({
  currencySymbol,
  pendingOpeningBalance,
  openingBalanceSetByName,
}: {
  currencySymbol: string;
  pendingOpeningBalance: number | null;
  openingBalanceSetByName: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<DenominationCounts>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (pendingOpeningBalance !== null) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700">
        <Wallet className="h-4 w-4" />
        Till opened with {formatMoney(pendingOpeningBalance, currencySymbol)}
        {openingBalanceSetByName ? ` by ${openingBalanceSetByName}` : ""}
      </div>
    );
  }

  function submit() {
    const value = denominationTotal(counts);
    if (value <= 0) {
      setError("Count at least some cash to set the opening float.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await openTillAction(value);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setCounts({});
      router.refresh();
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 hover:bg-amber-100"
      >
        <Wallet className="h-4 w-4" /> Open Till
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-neutral-900">Open Till</h2>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-4 text-xs text-neutral-400">
              Count the starting cash float in the drawer before service begins — carried into today&apos;s End Day
              reconciliation automatically.
            </p>
            <DenominationInput currencySymbol={currencySymbol} counts={counts} onChange={setCounts} autoFocusFirst />
            {error && <p className="mb-3 mt-3 text-xs font-medium text-rose-600">{error}</p>}
            <button
              onClick={submit}
              disabled={pending}
              className="mt-3 w-full rounded-xl bg-[var(--brand)] py-3 text-sm font-bold text-white hover:bg-[var(--brand-dark)] disabled:opacity-50"
            >
              {pending ? "Opening…" : "Open Till"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
