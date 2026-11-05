"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, MapPin, PackageCheck, Printer, Truck, X } from "lucide-react";
import { dispatchOrderAction, setPackedAction, setPickedAction } from "@/lib/actions/picking";
import type { PickOrder } from "@/lib/data/picking";
import { canonicalCode } from "@/lib/barcode";
import { playScanBeep } from "@/lib/order-sounds";
import { useBarcodeScanner } from "@/lib/use-barcode-scanner";
import { printDeliveryNote } from "@/lib/print-ticket";

// The Picking screen (docs/retail-plan steps 6.3–6.4): orders to send out, lines in walking order
// with their bins; scan a bin or an item to tick it off (wrong item → error); pack; dispatch with a
// carrier and tracking number; print a delivery note.
export function PickingClient({
  orders,
  barcodesByDish,
  business,
}: {
  orders: PickOrder[];
  barcodesByDish: Record<string, { code: string; packQty: number; variantId?: string }[]>;
  business: { name: string; address: string | null; phone: string | null };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(orders[0]?.id ?? null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [dispatching, setDispatching] = useState<PickOrder | null>(null);
  const active = orders.find((o) => o.id === activeId) ?? orders[0] ?? null;

  const codeToDish = useMemo(() => {
    const m = new Map<string, { dishId: string; variantId?: string }>();
    for (const [dishId, list] of Object.entries(barcodesByDish)) for (const b of list) m.set(b.code, { dishId, variantId: b.variantId });
    return m;
  }, [barcodesByDish]);

  // Scanning an item ticks the next unpicked line of that product; the wrong item is refused.
  useBarcodeScanner((raw) => {
    if (!active) return;
    const hit = codeToDish.get(canonicalCode(raw));
    const line = hit ? active.lines.find((l) => l.item.dishId === hit.dishId && (!hit.variantId || l.item.variantId === hit.variantId) && !l.item.ready && !l.item.short) : undefined;
    if (!hit || !line) {
      setNotice({ kind: "error", text: hit ? "That item is already picked, or isn't on this order." : `${raw} isn't on this order.` });
      playScanBeep(false);
      return;
    }
    playScanBeep(true);
    setNotice({ kind: "ok", text: `Picked — ${line.item.name}` });
    startTransition(async () => {
      await setPickedAction(active.id, line.item.lineId ?? line.item.dishId, "picked");
      router.refresh();
    });
  });
  useEffect(() => {
    if (!notice || notice.kind === "error") return;
    const t = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(t);
  }, [notice]);

  const mark = (o: PickOrder, lineId: string, state: "picked" | "short" | "none") =>
    startTransition(async () => {
      const r = await setPickedAction(o.id, lineId, state);
      if (r.error) setNotice({ kind: "error", text: r.error });
      router.refresh();
    });

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      <aside className="max-h-60 shrink-0 overflow-y-auto border-b border-neutral-200 bg-white md:max-h-none md:w-72 md:border-b-0 md:border-r">
        <h1 className="px-4 pb-1 pt-4 text-lg font-semibold text-neutral-900">Picking</h1>
        <p className="px-4 pb-2 text-xs text-neutral-400">Delivery and click &amp; collect orders waiting to go out.</p>
        {orders.length === 0 && <p className="px-4 py-8 text-sm text-neutral-400">Nothing to pick right now.</p>}
        {orders.map((o) => {
          const done = o.lines.filter((l) => l.item.ready || l.item.short).length;
          return (
            <button key={o.id} onClick={() => setActiveId(o.id)} className={`flex w-full items-center justify-between gap-2 border-t border-neutral-100 px-4 py-3 text-left hover:bg-neutral-50 ${active?.id === o.id ? "bg-[var(--brand-light)]" : ""}`}>
              <div className="min-w-0">
                <div className="font-semibold text-neutral-800">#{o.orderNumber}</div>
                <div className="truncate text-xs text-neutral-400">
                  {o.channel} · {o.customerName ?? "No name"}
                </div>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${o.pickStatus === "packed" ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>
                {o.pickStatus === "packed" ? "Packed" : `${done}/${o.lines.length}`}
              </span>
            </button>
          );
        })}
      </aside>

      <section className="min-w-0 flex-1 overflow-y-auto p-5">
        {notice && (
          <div role="status" className={`mb-3 flex items-center justify-between rounded-xl px-4 py-2.5 text-sm font-semibold ${notice.kind === "ok" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}`}>
            {notice.text}
            <button onClick={() => setNotice(null)} aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {!active ? (
          <p className="py-16 text-center text-neutral-400">Select an order.</p>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-neutral-900">Order #{active.orderNumber}</h2>
                <p className="text-sm text-neutral-500">
                  {active.channel}
                  {active.customerName ? ` · ${active.customerName}` : ""}
                  {active.customerPhone ? ` · ${active.customerPhone}` : ""}
                </p>
                {active.customerAddress && <p className="whitespace-pre-line text-sm text-neutral-500">{active.customerAddress}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => printDeliveryNote({ business, order: { orderNumber: active.orderNumber, createdAt: active.createdAt, channel: active.channel, customerName: active.customerName, customerPhone: active.customerPhone, customerAddress: active.customerAddress, lines: active.lines.map((l) => ({ name: l.item.name, qty: l.item.qty, unit: l.item.unit, sellBy: l.item.sellBy, serials: l.item.serials, short: !!l.item.short })) } })} className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">
                  <Printer className="h-4 w-4" /> Delivery note
                </button>
                {active.pickStatus !== "packed" ? (
                  <button disabled={pending} onClick={() => startTransition(async () => { const r = await setPackedAction(active.id); if (r.error) setNotice({ kind: "error", text: r.error }); router.refresh(); })} className="flex items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:opacity-50">
                    <PackageCheck className="h-4 w-4" /> Mark packed
                  </button>
                ) : (
                  <button onClick={() => setDispatching(active)} className="flex items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]">
                    <Truck className="h-4 w-4" /> Dispatch
                  </button>
                )}
              </div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
              {active.lines.map((l) => {
                const lineId = l.item.lineId ?? l.item.dishId;
                const picked = !!l.item.ready;
                const short = !!l.item.short;
                return (
                  <div key={lineId} className={`flex items-center gap-3 border-t border-neutral-100 px-4 py-3 first:border-t-0 ${picked ? "bg-emerald-50/50" : short ? "bg-amber-50/60" : ""}`}>
                    <button
                      onClick={() => mark(active, lineId, picked ? "none" : "picked")}
                      aria-label={`${picked ? "Un-pick" : "Pick"} ${l.item.name}`}
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 ${picked ? "border-emerald-500 bg-emerald-500 text-white" : "border-neutral-300 text-transparent hover:border-emerald-400"}`}
                    >
                      <Check className="h-5 w-5" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-neutral-800">
                        {l.item.qty}
                        {l.item.sellBy && l.item.sellBy !== "unit" ? ` ${l.item.unit}` : "×"} {l.item.name}
                      </div>
                      <div className="flex flex-wrap items-center gap-1 text-xs text-neutral-400">
                        {l.bins.length === 0 ? (
                          <span>No bin recorded</span>
                        ) : (
                          l.bins.slice(0, 3).map((b) => (
                            <span key={b.code} className="flex items-center gap-1 rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-neutral-600">
                              <MapPin className="h-3 w-3" />
                              {b.code} ({Math.round(b.quantity * 1000) / 1000})
                            </span>
                          ))
                        )}
                        {l.item.serials?.length ? <span className="font-mono">S/N {l.item.serials.join(", ")}</span> : null}
                      </div>
                    </div>
                    <button onClick={() => mark(active, lineId, short ? "none" : "short")} className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${short ? "bg-amber-500 text-white" : "border border-neutral-200 text-neutral-500 hover:bg-neutral-50"}`}>
                      {short ? "Short" : "Mark short"}
                    </button>
                  </div>
                );
              })}
            </div>
            {active.pickStatus === "packed" && <p className="mt-3 text-sm font-medium text-emerald-600">Packed — ready to dispatch.</p>}
          </>
        )}
      </section>

      {dispatching && <DispatchModal order={dispatching} onClose={() => setDispatching(null)} onDone={() => { setDispatching(null); router.refresh(); }} />}
    </div>
  );
}

function DispatchModal({ order, onClose, onDone }: { order: PickOrder; onClose: () => void; onDone: () => void }) {
  const [carrier, setCarrier] = useState(order.carrier ?? "");
  const [tracking, setTracking] = useState(order.tracking ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const input = "w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Dispatch">
        <h2 className="mb-1 text-lg font-semibold text-neutral-900">Dispatch #{order.orderNumber}</h2>
        <p className="mb-4 text-sm text-neutral-500">Who is taking it, and the tracking number if there is one.</p>
        <label className="mb-1 block text-xs font-medium text-neutral-500">Carrier</label>
        <input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="e.g. DPD, own van, collected" aria-label="Carrier" className={`mb-3 ${input}`} />
        <label className="mb-1 block text-xs font-medium text-neutral-500">Tracking number</label>
        <input value={tracking} onChange={(e) => setTracking(e.target.value)} aria-label="Tracking number" className={`mb-3 ${input}`} />
        {error && <p className="mb-3 text-xs font-medium text-rose-600">{error}</p>}
        <button
          disabled={pending}
          onClick={() => startTransition(async () => {
            const r = await dispatchOrderAction(order.id, { carrier, tracking });
            if (r.error) return setError(r.error);
            onDone();
          })}
          className="w-full rounded-xl bg-[var(--brand)] py-3 text-sm font-bold text-white hover:bg-[var(--brand-dark)] disabled:opacity-50"
        >
          Dispatched
        </button>
      </div>
    </div>
  );
}
