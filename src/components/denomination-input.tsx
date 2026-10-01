"use client";

import { useEffect, useRef } from "react";

// UK cash drawer denominations, notes down to coins — counting each one and letting the
// total add itself up avoids the fat-fingered mental-math errors a single "type the total"
// field invites (the actual point of this component).
export const CASH_DENOMINATIONS = [50, 20, 10, 5, 2, 1, 0.2, 0.1, 0.05] as const;

function formatDenomination(value: number, currencySymbol: string) {
  return value >= 1 ? `${currencySymbol}${value}` : `${Math.round(value * 100)}p`;
}

// Counts of each denomination, keyed by its value as a string (object keys coerce numbers to
// strings anyway, so this just makes that explicit).
export type DenominationCounts = Record<string, string>;

export function denominationTotal(counts: DenominationCounts) {
  return CASH_DENOMINATIONS.reduce((sum, d) => sum + d * (Number(counts[String(d)]) || 0), 0);
}

export function DenominationInput({
  currencySymbol,
  counts,
  onChange,
  autoFocusFirst,
}: {
  currencySymbol: string;
  counts: DenominationCounts;
  onChange: (counts: DenominationCounts) => void;
  autoFocusFirst?: boolean;
}) {
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Runs once on mount only — this component is remounted fresh each time its parent modal
  // opens, so "on mount" already means "once per time this grid appears."
  useEffect(() => {
    if (autoFocusFirst) firstInputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = denominationTotal(counts);

  function setCount(denomination: number, qty: string) {
    onChange({ ...counts, [String(denomination)]: qty });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200">
      <div className="grid grid-cols-3 gap-px bg-neutral-100">
        {CASH_DENOMINATIONS.map((d, i) => {
          const qty = counts[String(d)] ?? "";
          const subtotal = d * (Number(qty) || 0);
          return (
            <div key={d} className="bg-white p-2">
              <label className="mb-1 block text-center text-xs font-semibold text-neutral-500">
                {formatDenomination(d, currencySymbol)}
              </label>
              <input
                ref={i === 0 ? firstInputRef : undefined}
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={qty}
                onChange={(e) => setCount(d, e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-center text-sm outline-none focus:border-teal-500"
              />
              {subtotal > 0 && (
                <div className="mt-1 text-center text-[10px] text-neutral-400">
                  {currencySymbol}
                  {subtotal.toFixed(2)}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between bg-neutral-50 px-3.5 py-2.5 text-sm font-bold text-neutral-900">
        <span>Total</span>
        <span>
          {currencySymbol}
          {total.toFixed(2)}
        </span>
      </div>
    </div>
  );
}
