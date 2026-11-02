"use client";

import { ShieldAlert } from "lucide-react";

// Challenge 25 prompt for age-restricted products (docs/retail-plan step 3.5). Asked once per
// sale per age level; "Refuse sale" removes the item and the refusal is logged (age_checks).
export function AgeCheckModal({
  productName,
  minAge,
  onApprove,
  onRefuse,
}: {
  productName: string;
  minAge: number;
  onApprove: (method: "looks-over-25" | "id-checked") => void;
  onRefuse: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" role="alertdialog" aria-label="Age check">
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <ShieldAlert className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-neutral-900">Age check — {minAge}+</h2>
            <p className="text-sm text-neutral-500">{productName}</p>
          </div>
        </div>
        <p className="mb-4 text-sm text-neutral-700">
          Challenge 25: if the customer looks under 25, ask for photo ID (passport, driving licence or a PASS card) showing they are {minAge} or over.
        </p>
        <div className="space-y-2">
          <button onClick={() => onApprove("looks-over-25")} className="w-full rounded-xl bg-[var(--brand)] py-3 text-sm font-bold text-white hover:bg-[var(--brand-dark)]">
            Customer looks over 25
          </button>
          <button onClick={() => onApprove("id-checked")} className="w-full rounded-xl border border-[var(--brand)] py-3 text-sm font-bold text-[var(--brand-dark)] hover:bg-[var(--brand-light)]">
            ID checked — {minAge} or over
          </button>
          <button onClick={onRefuse} className="w-full rounded-xl border border-rose-200 bg-rose-50 py-3 text-sm font-bold text-rose-700 hover:bg-rose-100">
            Refuse sale
          </button>
        </div>
      </div>
    </div>
  );
}
