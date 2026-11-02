"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Mail, PackageCheck, Send, Trash2, XCircle } from "lucide-react";
import { StockItemPicker, type PickItem } from "@/components/stock-item-picker";
import { cancelPurchaseOrderAction, closePurchaseOrderAction, savePurchaseOrderAction, sendPurchaseOrderAction } from "@/lib/actions/purchase-orders";
import { formatMoney, type PurchaseOrder, type PurchaseOrderLine } from "@/lib/types";
import { PO_STATUS } from "../status";

type Item = PickItem & { quantity: number };
interface Line {
  itemId: string;
  name: string;
  unit: string;
  qty: string;
  cost: string;
  received: number;
}

const dateInput = (ms: number | null | undefined) => (ms ? new Date(ms).toISOString().slice(0, 10) : "");

export function PurchaseOrderClient({
  order,
  initialSupplierId,
  items,
  suppliers,
  currencySymbol,
}: {
  order: (PurchaseOrder & { lines: PurchaseOrderLine[] }) | null;
  initialSupplierId: string;
  items: Item[];
  suppliers: { id: string; name: string; email: string | null }[];
  currencySymbol: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const editable = !order || order.status === "draft";
  const [supplierId, setSupplierId] = useState(initialSupplierId);
  const [expected, setExpected] = useState(dateInput(order?.expectedAt));
  const [notes, setNotes] = useState(order?.notes ?? "");
  const [lines, setLines] = useState<Line[]>(() =>
    (order?.lines ?? []).map((l) => ({ itemId: l.inventoryItemId, name: l.name, unit: l.unit, qty: String(l.qtyOrdered), cost: l.unitCost != null ? String(l.unitCost) : "", received: l.qtyReceived }))
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const supplier = suppliers.find((s) => s.id === supplierId);
  const supplierItems = items.filter((i) => !supplierId || !i.supplierId || i.supplierId === supplierId);
  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.cost) || 0), 0);

  function add(item: PickItem, packQty: number) {
    setLines((cur) => {
      const at = cur.findIndex((l) => l.itemId === item.id);
      if (at >= 0) return cur.map((l, i) => (i === at ? { ...l, qty: String(Math.round((Number(l.qty) + packQty) * 1000) / 1000) } : l));
      return [...cur, { itemId: item.id, name: item.name, unit: item.unit, qty: String(packQty), cost: item.costPrice != null ? String(item.costPrice) : "", received: 0 }];
    });
  }

  async function persist() {
    const res = await savePurchaseOrderAction(order?.id ?? null, {
      supplierId,
      expectedAt: expected ? new Date(`${expected}T12:00:00`).getTime() : null,
      notes,
      lines: lines.map((l) => ({ inventoryItemId: l.itemId, qty: Number(l.qty), unitCost: l.cost === "" ? null : Number(l.cost) })),
    });
    if (res.error) setError(res.error);
    return res.id ?? null;
  }

  function run(fn: () => Promise<void>) {
    setError(null);
    setNotice(null);
    startTransition(fn);
  }

  const saveDraft = () =>
    run(async () => {
      const id = await persist();
      if (id) router.replace(`/purchase-orders/${id}`);
      router.refresh();
      if (id) setNotice("Saved.");
    });

  const send = (byEmail: boolean) =>
    run(async () => {
      const id = await persist();
      if (!id) return;
      const res = await sendPurchaseOrderAction(id, byEmail);
      if (res.error) {
        setError(res.error);
        router.replace(`/purchase-orders/${id}`);
        return;
      }
      router.replace(`/purchase-orders/${id}`);
      router.refresh();
    });

  const act = (fn: () => Promise<{ error?: string }>) =>
    run(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      router.refresh();
    });

  const input = "rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm outline-none focus:border-teal-500 disabled:bg-neutral-50 disabled:text-neutral-500";
  const status = order ? PO_STATUS[order.status] : PO_STATUS.draft;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <Link href="/purchase-orders" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-500 hover:text-neutral-800">
        <ArrowLeft className="h-4 w-4" /> Purchase Orders
      </Link>
      <div className="mb-5 flex items-center gap-3">
        <h1 className="text-xl font-semibold text-neutral-900">{order ? order.number : "New purchase order"}</h1>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status.tone}`}>{status.label}</span>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-500">Supplier</label>
          <select value={supplierId} disabled={!editable} onChange={(e) => setSupplierId(e.target.value)} className={`${input} w-full py-2.5`}>
            <option value="">Choose a supplier…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-500">Wanted by</label>
          <input type="date" value={expected} disabled={!editable} onChange={(e) => setExpected(e.target.value)} className={`${input} w-full py-2.5`} />
        </div>
      </div>

      {editable && <StockItemPicker items={supplierItems} onPick={add} placeholder="Scan or search to add an item" />}

      <div className="mt-4 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs font-medium uppercase tracking-wide text-neutral-400">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Ordered</th>
              {!editable && <th className="px-4 py-3">Received</th>}
              <th className="px-4 py-3">Cost each ({currencySymbol})</th>
              {editable && <th className="w-10 px-2 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {lines.map((l, idx) => (
              <tr key={l.itemId}>
                <td className="px-4 py-2.5 font-medium text-neutral-800">{l.name}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <input
                      value={l.qty}
                      disabled={!editable}
                      onChange={(e) => setLines((cur) => cur.map((c, i) => (i === idx ? { ...c, qty: e.target.value.replace(/[^0-9.]/g, "") } : c)))}
                      inputMode="decimal"
                      aria-label={`Quantity of ${l.name}`}
                      className={`${input} w-24`}
                    />
                    <span className="text-xs text-neutral-400">{l.unit}</span>
                  </div>
                </td>
                {!editable && (
                  <td className={`px-4 py-2.5 font-medium ${l.received + 1e-9 >= Number(l.qty) ? "text-emerald-600" : "text-amber-600"}`}>
                    {l.received} {l.unit}
                  </td>
                )}
                <td className="px-4 py-2.5">
                  <input
                    value={l.cost}
                    disabled={!editable}
                    onChange={(e) => setLines((cur) => cur.map((c, i) => (i === idx ? { ...c, cost: e.target.value.replace(/[^0-9.]/g, "") } : c)))}
                    inputMode="decimal"
                    aria-label={`Cost of ${l.name}`}
                    placeholder="—"
                    className={`${input} w-24`}
                  />
                </td>
                {editable && (
                  <td className="px-2 py-2.5">
                    <button onClick={() => setLines((cur) => cur.filter((_, i) => i !== idx))} className="rounded-lg p-1.5 text-neutral-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove ${l.name}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-400">
                  No items yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <label className="mb-1 mt-4 block text-xs font-medium text-neutral-500">Notes for the supplier</label>
      <textarea value={notes} disabled={!editable} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${input} w-full`} />

      {error && <p className="mt-3 text-sm font-medium text-rose-600">{error}</p>}
      {notice && <p className="mt-3 text-sm font-medium text-emerald-600">{notice}</p>}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-medium text-neutral-600">{total > 0 ? `Total ${formatMoney(total, currencySymbol)}` : ""}</span>
        <div className="flex flex-wrap gap-2">
          {editable && (
            <>
              <button disabled={pending} onClick={saveDraft} className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40">
                Save draft
              </button>
              <button disabled={pending} onClick={() => send(false)} className="flex items-center gap-1.5 rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40">
                <Send className="h-4 w-4" /> Mark as sent
              </button>
              <button
                disabled={pending || !supplier?.email}
                title={supplier?.email ? `Email to ${supplier.email}` : "Add the supplier's email on the Suppliers screen"}
                onClick={() => send(true)}
                className="flex items-center gap-1.5 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:opacity-40"
              >
                <Mail className="h-4 w-4" /> Email to supplier
              </button>
            </>
          )}
          {order && (order.status === "sent" || order.status === "part_received") && (
            <>
              <Link href={`/inventory/goods-in?po=${order.id}`} className="flex items-center gap-1.5 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]">
                <PackageCheck className="h-4 w-4" /> Receive delivery
              </Link>
              {order.status === "part_received" && (
                <button disabled={pending} onClick={() => act(() => closePurchaseOrderAction(order.id))} className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">
                  Close — no more coming
                </button>
              )}
            </>
          )}
          {order && order.status !== "received" && order.status !== "cancelled" && (
            <button disabled={pending} onClick={() => confirm(`Cancel ${order.number}?`) && act(() => cancelPurchaseOrderAction(order.id))} className="flex items-center gap-1.5 rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50">
              <XCircle className="h-4 w-4" /> Cancel order
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
