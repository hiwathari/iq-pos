"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { ReorderRow } from "@/lib/data/stock";
import { createOrdersFromReorderAction } from "@/lib/actions/purchase-orders";
import { formatMoney } from "@/lib/types";

// Reorder (docs/retail-plan step 4.7): what's running low, grouped by supplier, one click to
// draft a purchase order for each supplier.
export function ReorderClient({ rows, currencySymbol }: { rows: ReorderRow[]; currencySymbol: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.id, String(r.suggested)])));
  const [off, setOff] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const groups = new Map<string, ReorderRow[]>();
  for (const r of rows) groups.set(r.supplierId ?? "", [...(groups.get(r.supplierId ?? "") ?? []), r]);
  const noSupplier = groups.get("") ?? [];
  const suppliers = [...groups.entries()].filter(([k]) => k);

  function create(only?: string) {
    const picked = suppliers
      .filter(([k]) => !only || k === only)
      .map(([supplierId, list]) => ({
        supplierId,
        lines: list.filter((r) => !off.has(r.id) && Number(qty[r.id]) > 0).map((r) => ({ inventoryItemId: r.id, qty: Number(qty[r.id]) })),
      }))
      .filter((g) => g.lines.length);
    if (picked.length === 0) return setError("Nothing selected to order.");
    setError(null);
    startTransition(async () => {
      const res = await createOrdersFromReorderAction(picked);
      if (res.error) return setError(res.error);
      router.push(res.ids!.length === 1 ? `/purchase-orders/${res.ids![0]}` : "/purchase-orders");
    });
  }

  const table = (list: ReorderRow[], canOrder: boolean) => (
    <table className="w-full text-sm">
      <thead className="bg-neutral-50 text-left text-xs font-medium uppercase tracking-wide text-neutral-400">
        <tr>
          {canOrder && <th className="w-10 px-4 py-3" />}
          <th className="px-4 py-3">Item</th>
          <th className="px-4 py-3">In stock</th>
          <th className="px-4 py-3">Reorder at</th>
          <th className="px-4 py-3">On order</th>
          <th className="px-4 py-3">Order</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-neutral-100">
        {list.map((r) => (
          <tr key={r.id}>
            {canOrder && (
              <td className="px-4 py-2.5">
                <input
                  type="checkbox"
                  checked={!off.has(r.id)}
                  onChange={() => setOff((cur) => { const n = new Set(cur); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}
                  aria-label={`Order ${r.name}`}
                  className="h-4 w-4 accent-[var(--brand)]"
                />
              </td>
            )}
            <td className="px-4 py-2.5 font-medium text-neutral-800">{r.name}</td>
            <td className={`px-4 py-2.5 font-semibold ${r.quantity <= 0 ? "text-rose-600" : "text-amber-700"}`}>
              {Math.round(r.quantity * 1000) / 1000} {r.unit}
            </td>
            <td className="px-4 py-2.5 text-neutral-500">{r.level}</td>
            <td className="px-4 py-2.5 text-neutral-500">{r.onOrder || "—"}</td>
            <td className="px-4 py-2.5">
              {canOrder ? (
                <div className="flex items-center gap-1.5">
                  <input
                    value={qty[r.id] ?? ""}
                    onChange={(e) => setQty((cur) => ({ ...cur, [r.id]: e.target.value.replace(/[^0-9.]/g, "") }))}
                    inputMode="decimal"
                    aria-label={`How many ${r.name}`}
                    className="w-20 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm outline-none focus:border-teal-500"
                  />
                  <span className="text-xs text-neutral-400">
                    {r.unit}
                    {r.costPrice != null && Number(qty[r.id]) > 0 ? ` · ${formatMoney(Number(qty[r.id]) * r.costPrice, currencySymbol)}` : ""}
                  </span>
                </div>
              ) : (
                <span className="text-neutral-400">
                  {r.suggested} {r.unit}
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Link href="/inventory" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-500 hover:text-neutral-800">
        <ArrowLeft className="h-4 w-4" /> Stock
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Reorder</h1>
          <p className="text-sm text-neutral-400">Items at or below their reorder level, not already on an open order. Change a quantity or untick what you don&apos;t want.</p>
        </div>
        {suppliers.length > 0 && (
          <button disabled={pending} onClick={() => create()} className="rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:opacity-40">
            Create purchase orders
          </button>
        )}
      </div>
      {error && <p className="mb-3 text-sm font-medium text-rose-600">{error}</p>}
      {rows.length === 0 && <p className="rounded-2xl border border-neutral-200 bg-white px-5 py-10 text-center text-neutral-400">Nothing needs ordering right now.</p>}
      <div className="space-y-5">
        {suppliers.map(([id, list]) => (
          <section key={id} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
              <h2 className="font-semibold text-neutral-800">{list[0].supplierName ?? "Supplier"}</h2>
              <button disabled={pending} onClick={() => create(id)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--brand-dark)] hover:bg-[var(--brand-light)] disabled:opacity-40">
                Create order for this supplier
              </button>
            </div>
            {table(list, true)}
          </section>
        ))}
        {noSupplier.length > 0 && (
          <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            <div className="border-b border-neutral-100 px-4 py-3">
              <h2 className="font-semibold text-neutral-800">No supplier set</h2>
              <p className="text-xs text-neutral-400">Give these a supplier (edit the item on the Stock screen) to order them from here.</p>
            </div>
            {table(noSupplier, false)}
          </section>
        )}
      </div>
    </div>
  );
}
