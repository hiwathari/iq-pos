"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { formatMoney } from "@/lib/types";

// Change one line's price on the Till, with a reason (docs/retail-plan step 3.6) — reduced to
// clear, damaged, price match. Needs the till-price-override permission (managers by default).
const REASONS = ["Reduced to clear", "Damaged", "Price match", "Other"] as const;

export function PriceOverrideModal({
  name,
  unitLabel,
  original,
  current,
  currencySymbol,
  onSave,
  onReset,
  onClose,
}: {
  name: string;
  unitLabel: string; // "each", "per kg"…
  original: number;
  current: number;
  currencySymbol: string;
  onSave: (price: number, reason: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [price, setPrice] = useState(current === original ? "" : String(current));
  const [reason, setReason] = useState<(typeof REASONS)[number]>("Reduced to clear");
  const [other, setOther] = useState("");
  const value = Number(price);
  const valid = price !== "" && Number.isFinite(value) && value >= 0 && value !== original && (reason !== "Other" || other.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Change price">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Change price</h2>
            <p className="text-sm text-neutral-500">
              {name} · was {formatMoney(original, currencySymbol)} {unitLabel}
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <label className="mb-1.5 block text-xs font-medium text-neutral-500">New price ({currencySymbol}) {unitLabel}</label>
        <input
          autoFocus
          value={price}
          onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))}
          inputMode="decimal"
          placeholder={original.toFixed(2)}
          className="mb-3 w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-lg outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
        />
        <div className="mb-3 grid grid-cols-2 gap-2">
          {REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className={`rounded-lg border px-2 py-2 text-sm font-medium ${reason === r ? "border-[var(--brand)] bg-[var(--brand-light)] text-[var(--brand-dark)]" : "border-neutral-200 text-neutral-600"}`}
            >
              {r}
            </button>
          ))}
        </div>
        {reason === "Other" && (
          <input value={other} onChange={(e) => setOther(e.target.value)} placeholder="Reason" className="mb-3 w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500" />
        )}
        <div className="flex gap-2">
          {current !== original && (
            <button onClick={onReset} className="flex-1 rounded-xl border border-neutral-200 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50">
              Back to {formatMoney(original, currencySymbol)}
            </button>
          )}
          <button
            disabled={!valid}
            onClick={() => onSave(Math.round(value * 100) / 100, reason === "Other" ? other.trim() : reason)}
            className="flex-1 rounded-xl bg-[var(--brand)] py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:opacity-40"
          >
            Save price
          </button>
        </div>
      </div>
    </div>
  );
}
