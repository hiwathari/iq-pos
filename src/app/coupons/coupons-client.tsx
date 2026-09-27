"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCouponAction, deleteCouponAction, toggleCouponActiveAction } from "@/lib/actions/coupons";
import { formatMoney } from "@/lib/types";
import type { Coupon, CouponType } from "@/lib/types";
import { Plus, Tag, Trash2, X } from "lucide-react";

export function CouponsClient({ coupons, currencySymbol }: { coupons: Coupon[]; currencySymbol: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);

  function toggleActive(coupon: Coupon) {
    startTransition(async () => {
      await toggleCouponActiveAction(coupon.id, !coupon.active);
      router.refresh();
    });
  }

  function remove(coupon: Coupon) {
    if (!confirm(`Delete coupon "${coupon.code}"? Orders that already used it keep their record.`)) return;
    startTransition(async () => {
      await deleteCouponAction(coupon.id);
      router.refresh();
    });
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Coupons</h1>
          <p className="text-sm text-neutral-400">Codes staff can apply at the Till to discount an order.</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]"
        >
          <Plus className="h-4 w-4" /> New Coupon
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs font-medium uppercase tracking-wide text-neutral-400">
            <tr>
              <th className="px-5 py-3">Code</th>
              <th className="px-5 py-3">Discount</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {coupons.map((c) => (
              <tr key={c.id}>
                <td className="flex items-center gap-2 px-5 py-3 font-mono font-semibold text-neutral-800">
                  <Tag className="h-3.5 w-3.5 text-neutral-400" /> {c.code}
                </td>
                <td className="px-5 py-3 text-neutral-600">
                  {c.type === "percent" ? `${c.value}% off` : `${formatMoney(c.value, currencySymbol)} off`}
                </td>
                <td className="px-5 py-3">
                  <button
                    onClick={() => toggleActive(c)}
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      c.active ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-500"
                    }`}
                  >
                    {c.active ? "Active" : "Disabled"}
                  </button>
                </td>
                <td className="px-5 py-3 text-right">
                  <button onClick={() => remove(c)} className="rounded-lg p-1.5 text-neutral-400 hover:bg-rose-50 hover:text-rose-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {coupons.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-neutral-400">
                  No coupons yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && <NewCouponModal onClose={() => setModalOpen(false)} />}
    </div>
  );
}

function NewCouponModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [type, setType] = useState<CouponType>("percent");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    const numeric = Number(value);
    startTransition(async () => {
      const result = await createCouponAction({ code, type, value: numeric });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">New Coupon</h2>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="mb-1 block text-xs font-medium text-neutral-500">Code</label>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="e.g. WELCOME10"
          className="mb-4 w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm font-mono uppercase focus:border-teal-500 focus:outline-none"
        />

        <label className="mb-1 block text-xs font-medium text-neutral-500">Type</label>
        <div className="mb-4 grid grid-cols-2 gap-2">
          <button
            onClick={() => setType("percent")}
            className={`rounded-xl border py-2.5 text-sm font-semibold ${
              type === "percent" ? "border-[var(--brand)] bg-[var(--brand-light)] text-[var(--brand-dark)]" : "border-neutral-200 text-neutral-500"
            }`}
          >
            % Percent
          </button>
          <button
            onClick={() => setType("fixed")}
            className={`rounded-xl border py-2.5 text-sm font-semibold ${
              type === "fixed" ? "border-[var(--brand)] bg-[var(--brand-light)] text-[var(--brand-dark)]" : "border-neutral-200 text-neutral-500"
            }`}
          >
            Fixed Amount
          </button>
        </div>

        <label className="mb-1 block text-xs font-medium text-neutral-500">Value</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={type === "percent" ? "10" : "5.00"}
          className="mb-4 w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm focus:border-teal-500 focus:outline-none"
        />

        {error && <p className="mb-4 text-xs font-medium text-rose-600">{error}</p>}

        <button
          onClick={submit}
          disabled={pending || !code || !value}
          className="w-full rounded-xl bg-[var(--brand)] py-3 text-sm font-bold text-white hover:bg-[var(--brand-dark)] disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create Coupon"}
        </button>
      </div>
    </div>
  );
}
