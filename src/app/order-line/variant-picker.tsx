"use client";

import { X } from "lucide-react";
import { formatMoney } from "@/lib/types";
import type { VariantLite } from "@/lib/variants";

// Pick the size / colour when a product has variants (docs/retail-plan step 5.1). Each button shows
// its own price and how many are left; with "block" overselling an empty one can't be picked.
export function VariantPicker({
  name,
  variants,
  basePrice,
  currencySymbol,
  blockEmpty,
  inBasket,
  onPick,
  onClose,
}: {
  name: string;
  variants: VariantLite[];
  basePrice: number;
  currencySymbol: string;
  blockEmpty: boolean;
  inBasket: (variantId: string) => number;
  onPick: (variant: VariantLite) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Choose an option for ${name}`}>
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">{name}</h2>
            <p className="text-sm text-neutral-500">Choose one</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {variants.map((v) => {
            const left = v.qty == null ? null : v.qty - inBasket(v.id);
            const empty = left != null && left <= 1e-9;
            return (
              <button
                key={v.id}
                type="button"
                disabled={empty && blockEmpty}
                onClick={() => onPick(v)}
                className={`rounded-xl border px-3 py-3 text-left transition hover:border-[var(--brand)] hover:bg-[var(--brand-light)] disabled:cursor-not-allowed disabled:opacity-40 ${empty ? "border-rose-200" : "border-neutral-200"}`}
              >
                <div className="text-sm font-semibold text-neutral-900">{v.name}</div>
                <div className="text-sm text-neutral-600">{formatMoney(v.price ?? basePrice, currencySymbol)}</div>
                {left != null && <div className={`mt-0.5 text-xs font-medium ${empty ? "text-rose-600" : left <= v.low ? "text-amber-600" : "text-neutral-400"}`}>{empty ? "None left" : `${Math.round(left * 1000) / 1000} left`}</div>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
