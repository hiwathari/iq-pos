"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Trash2 } from "lucide-react";
import { StockItemPicker, type PickItem } from "@/components/stock-item-picker";
import { receiveStockAction } from "@/lib/actions/inventory";
import { formatMoney } from "@/lib/types";

interface Line {
  item: PickItem;
  qty: string;
  cost: string;
}

// Goods in (docs/retail-plan step 4.2): book a delivery in by scanning. Opened from a purchase
// order it arrives filled in with what's still to come.
export function GoodsInClient({
  items,
  suppliers,
  currencySymbol,
  order,
}: {
  items: PickItem[];
  suppliers: { id: string; name: string }[];
  currencySymbol: string;
  order: { id: string; number: string; supplierId: string; lines: { itemId: string; qty: number; cost: number | null }[] } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [supplierId, setSupplierId] = useState(order?.supplierId ?? "");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<Line[]>(() =>
    (order?.lines ?? [])
      .map((l) => ({ item: items.find((i) => i.id === l.itemId), qty: l.qty, cost: l.cost }))
      .filter((l): l is { item: PickItem; qty: number; cost: number | null } => !!l.item && l.qty > 0)
      .map((l) => ({ item: l.item, qty: String(l.qty), cost: l.cost != null ? String(l.cost) : l.item.costPrice != null ? String(l.item.costPrice) : "" }))
  );
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function add(item: PickItem, packQty: number) {
    setDone(null);
    setLines((cur) => {
      const at = cur.findIndex((l) => l.item.id === item.id);
      if (at >= 0) return cur.map((l, i) => (i === at ? { ...l, qty: String(Math.round((Number(l.qty) + packQty) * 1000) / 1000) } : l));
      return [...cur, { item, qty: String(packQty), cost: item.costPrice != null ? String(item.costPrice) : "" }];
    });
  }

  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.cost) || 0), 0);

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await receiveStockAction({
        supplierId: supplierId || null,
        reference,
        purchaseOrderId: order?.id ?? null,
        lines: lines.map((l) => ({ itemId: l.item.id, qty: Number(l.qty), cost: l.cost === "" ? null : Number(l.cost) })),
      });
      if (res.error) return setError(res.error);
      setLines([]);
      setReference("");
      setDone(`Booked in ${res.booked} item${res.booked === 1 ? "" : "s"}.`);
      if (order) router.push(`/purchase-orders/${order.id}`);
      else router.refresh();
    });
  }

  const input = "rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm outline-none focus:border-teal-500";
  return (
    <div className="mx-auto max-w-3xl p-6">
      <Link href={order ? `/purchase-orders/${order.id}` : "/inventory"} className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-500 hover:text-neutral-800">
        <ArrowLeft className="h-4 w-4" /> {order ? order.number : "Stock"}
      </Link>
      <h1 className="text-xl font-semibold text-neutral-900">Goods in{order ? ` — ${order.number}` : ""}</h1>
      <p className="mb-5 text-sm text-neutral-400">Scan what arrived (a case barcode adds a whole case), check the quantities and costs, then book it in.</p>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-500">Supplier</label>
          <select value={supplierId} disabled={!!order} onChange={(e) => setSupplierId(e.target.value)} className={`${input} w-full py-2.5`}>
            <option value="">No supplier</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-500">Delivery note number</label>
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. 4471" className={`${input} w-full py-2.5`} />
        </div>
      </div>

      <StockItemPicker items={items} onPick={add} autoFocus />

      <div className="mt-4 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs font-medium uppercase tracking-wide text-neutral-400">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Quantity</th>
              <th className="px-4 py-3">Cost each ({currencySymbol})</th>
              <th className="w-10 px-2 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {lines.map((l, idx) => (
              <tr key={l.item.id}>
                <td className="px-4 py-2.5 font-medium text-neutral-800">{l.item.name}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <input
                      value={l.qty}
                      onChange={(e) => setLines((cur) => cur.map((c, i) => (i === idx ? { ...c, qty: e.target.value.replace(/[^0-9.]/g, "") } : c)))}
                      inputMode="decimal"
                      aria-label={`Quantity of ${l.item.name}`}
                      className={`${input} w-24`}
                    />
                    <span className="text-xs text-neutral-400">{l.item.unit}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <input
                    value={l.cost}
                    onChange={(e) => setLines((cur) => cur.map((c, i) => (i === idx ? { ...c, cost: e.target.value.replace(/[^0-9.]/g, "") } : c)))}
                    inputMode="decimal"
                    aria-label={`Cost of ${l.item.name}`}
                    placeholder="—"
                    className={`${input} w-24`}
                  />
                </td>
                <td className="px-2 py-2.5">
                  <button onClick={() => setLines((cur) => cur.filter((_, i) => i !== idx))} className="rounded-lg p-1.5 text-neutral-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove ${l.item.name}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-neutral-400">
                  Nothing scanned yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {error && <p className="mt-3 text-sm font-medium text-rose-600">{error}</p>}
      {done && (
        <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-emerald-600">
          <CheckCircle2 className="h-4 w-4" /> {done}
        </p>
      )}
      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm text-neutral-500">{total > 0 ? `Delivery worth ${formatMoney(total, currencySymbol)} at cost` : ""}</span>
        <button
          disabled={pending || lines.length === 0}
          onClick={save}
          className="rounded-xl bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:opacity-40"
        >
          {pending ? "Booking in…" : "Book in"}
        </button>
      </div>
    </div>
  );
}
