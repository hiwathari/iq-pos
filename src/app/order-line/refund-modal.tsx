"use client";

import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, RotateCcw, X } from "lucide-react";
import { formatMoney, itemsSubtotal, lineTotal, orderBreakdown, roundMoney, type Order, type PaymentTerminal } from "@/lib/types";
import { qtyPrefix } from "@/lib/units";
import { refundedLinesAction, refundOrderAction, type RefundResult } from "@/lib/actions/refunds";

// Refund / return on a paid sale (docs/retail-plan step 3.7): pick what's coming back (and how
// much of each line — a weighed line goes back whole), whether it goes back on the shelf, why,
// and how the money goes back. The server works out the exact amount the customer paid for it.
const REASONS = ["Changed mind", "Faulty", "Wrong item", "Out of date", "Damaged", "Other"];
// Goods returned for these reasons can go back on the shelf by default; faulty, damaged or out
// of date ones can't (staff can still tick "Back to stock" per line).
const sellable = (reason: string) => !["Faulty", "Damaged", "Out of date"].includes(reason);

export function RefundModal({
  order,
  paymentTerminals,
  currencySymbol,
  onClose,
  onDone,
}: {
  order: Order;
  paymentTerminals: PaymentTerminal[];
  currencySymbol: string;
  onClose: () => void;
  onDone: (refund: NonNullable<RefundResult["refund"]>, reason: string) => void;
}) {
  const [already, setAlready] = useState<Record<string, number> | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [backToStock, setBackToStock] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState("Changed mind");
  const [method, setMethod] = useState(order.paymentMethod && order.paymentMethod !== "Split" ? order.paymentMethod : "Cash");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    refundedLinesAction(order.id).then(setAlready).catch(() => setAlready({}));
  }, [order.id]);

  const factor = useMemo(() => {
    const sub = itemsSubtotal(order.items);
    return sub > 0 ? (sub - orderBreakdown(order).discount) / sub : 0;
  }, [order]);
  const left = (lineId: string, itemQty: number) => Math.round((itemQty - (already?.[lineId] ?? 0)) * 1000) / 1000;
  const estimate = roundMoney(
    order.items.reduce((s, i) => {
      const id = i.lineId ?? i.dishId;
      const q = qty[id] ?? 0;
      if (!q) return s;
      const share = q / i.qty;
      return s + lineTotal(i) * factor * share * (1 + (i.taxRate ?? 0) / 100);
    }, 0)
  );
  const methods = ["Cash", ...paymentTerminals.map((t) => t.name), "Store credit", ...(order.tradeAccountId ? ["On account"] : [])];

  async function confirm() {
    setSaving(true);
    setError(null);
    const res = await refundOrderAction(order.id, {
      lines: Object.entries(qty)
        .filter(([, q]) => q > 0)
        .map(([lineId, q]) => ({ lineId, qty: q, backToStock: backToStock[lineId] ?? sellable(reason) })),
      method,
      reason,
    }).catch(() => ({ error: "Couldn't reach the server — check the connection." }) as RefundResult);
    setSaving(false);
    if (res.error || !res.refund) setError(res.error ?? "Refund failed.");
    else onDone(res.refund, reason);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Refund">
        <div className="flex items-center justify-between px-5 pb-2 pt-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-neutral-900">
            <RotateCcw className="h-5 w-5" /> Refund — sale #{order.orderNumber}
          </h2>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        {order.refundedAmount > 0 && (
          <p className="px-5 text-sm text-amber-700">Already refunded {formatMoney(order.refundedAmount, currencySymbol)} on this sale.</p>
        )}
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-5 py-3">
          {order.items.map((i) => {
            const id = i.lineId ?? i.dishId;
            const max = left(id, i.qty);
            const q = qty[id] ?? 0;
            const measured = !!i.sellBy && i.sellBy !== "unit";
            const back = backToStock[id] ?? sellable(reason);
            return (
              <div key={id} className={`rounded-xl border px-3 py-2 ${q > 0 ? "border-[var(--brand)] bg-[var(--brand-light)]/40" : "border-neutral-200"} ${max <= 0 ? "opacity-50" : ""}`}>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    <b>{qtyPrefix(i)}</b> {i.name}
                  </span>
                  <span className="shrink-0 text-neutral-500">{formatMoney(lineTotal(i), currencySymbol)}</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  {max <= 0 ? (
                    <span className="text-xs text-neutral-500">Refunded</span>
                  ) : measured || i.fixedTotal != null ? (
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={q > 0} onChange={(e) => setQty((p) => ({ ...p, [id]: e.target.checked ? max : 0 }))} className="h-4 w-4 accent-[var(--brand)]" />
                      Refund {measured ? `${max} ${i.unit}` : "this line"}
                    </label>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setQty((p) => ({ ...p, [id]: Math.max(0, q - 1) }))} className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200" aria-label={`Less ${i.name}`}>
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-12 text-center text-sm font-semibold">
                        {q} / {max}
                      </span>
                      <button type="button" onClick={() => setQty((p) => ({ ...p, [id]: Math.min(max, q + 1) }))} className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--brand)] text-white" aria-label={`More ${i.name}`}>
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  {q > 0 && (
                    <label className="flex items-center gap-1.5 text-xs text-neutral-600">
                      <input type="checkbox" checked={back} onChange={(e) => setBackToStock((p) => ({ ...p, [id]: e.target.checked }))} className="h-4 w-4 accent-[var(--brand)]" />
                      Back to stock
                    </label>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="space-y-3 border-t border-neutral-100 px-5 pb-5 pt-3">
          <div>
            <div className="mb-1 text-xs font-medium text-neutral-500">Reason</div>
            <div className="flex flex-wrap gap-1.5">
              {REASONS.map((r) => (
                <button key={r} type="button" onClick={() => setReason(r)} className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${reason === r ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-neutral-200 text-neutral-600"}`}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-neutral-500">Money back to</div>
            <div className="flex flex-wrap gap-1.5">
              {methods.map((m) => (
                <button key={m} type="button" onClick={() => setMethod(m)} className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${method === m ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-neutral-200 text-neutral-600"}`}>
                  {m}
                </button>
              ))}
            </div>
            {method !== "Cash" && <p className="mt-1 text-xs text-neutral-500">Refund the card on the {method} machine first, then confirm here.</p>}
          </div>
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}
          <button
            type="button"
            disabled={saving || estimate <= 0 || already === null}
            onClick={confirm}
            className="w-full rounded-xl bg-rose-600 py-3 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-40"
          >
            {saving ? "Refunding…" : `Refund ${formatMoney(estimate, currencySymbol)} to ${method}`}
          </button>
        </div>
      </div>
    </div>
  );
}
