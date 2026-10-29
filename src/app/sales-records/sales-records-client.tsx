"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, FileText, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import {
  deleteOrderRecordAction,
  deleteShiftRecordAction,
  recalculateShiftAction,
  updateOrderRecordAction,
  updateShiftRecordAction,
} from "@/lib/actions/sales-records";
import { shiftDateKey } from "@/lib/business-day";
import type { Order, OrderChannel, Shift } from "@/lib/types";
import { formatMoney, formatOrderTimestamp, orderSequence, orderTotal, salesByTender, shiftTotals } from "@/lib/types";

const CHANNELS: OrderChannel[] = ["Dine in", "Wait List", "Take Away", "Delivery", "Online", "Third Party"];

function toLocalInput(ms: number) {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function paymentLabel(o: Order, currencySymbol: string) {
  if (o.payments?.length) return o.payments.map((p) => `${p.method} ${formatMoney(p.amount, currencySymbol)}`).join(" + ");
  return o.paymentMethod ?? "Unpaid";
}

export function SalesRecordsClient({
  tab,
  date,
  today,
  shifts,
  orders,
  paymentMethods,
  currencySymbol,
}: {
  tab: "reports" | "orders";
  date: string;
  today: string;
  shifts: Shift[];
  orders: Order[];
  paymentMethods: string[];
  currencySymbol: string;
}) {
  const router = useRouter();
  const [editShift, setEditShift] = useState<Shift | null>(null);
  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; body: string; run: () => Promise<unknown> } | null>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function run(fn: () => Promise<{ error?: string } | void>, done?: string) {
    setMessage(null);
    startTransition(async () => {
      const res = await fn();
      if (res && "error" in res && res.error) setMessage(res.error);
      else if (done) setMessage(done);
      router.refresh();
    });
  }

  const live = orders.filter((o) => o.status !== "Voided");
  const dayTotal = live.reduce((s, o) => s + orderTotal(o), 0);
  const tender = salesByTender(orders);
  const goDate = (d: string) => router.push(`/sales-records?tab=orders&date=${d}`);

  return (
    <div className="p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Sales Records</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">
            Every End Day report and every order, in one table. Fix a mistake with Edit, or remove an entry for good with Delete — deleting
            can&apos;t be undone.
          </p>
        </div>
        <div className="flex rounded-xl border border-neutral-200 bg-white p-1">
          {(
            [
              ["reports", "End Day reports"],
              ["orders", "Orders"],
            ] as const
          ).map(([id, label]) => (
            <Link
              key={id}
              href={id === "orders" ? `/sales-records?tab=orders&date=${date}` : "/sales-records"}
              className={`min-h-10 rounded-lg px-4 py-2 text-sm font-semibold ${tab === id ? "bg-[var(--brand)] text-white" : "text-neutral-500 hover:bg-neutral-50"}`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      {message && <div className="mb-4 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-700">{message}</div>}

      {tab === "reports" ? (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-neutral-50 text-left text-xs font-medium uppercase tracking-wide text-neutral-400">
              <tr>
                <th className="px-4 py-3">Closed</th>
                <th className="px-4 py-3">Closed by</th>
                <th className="px-4 py-3 text-right">Orders</th>
                <th className="px-4 py-3 text-right">POS cash</th>
                <th className="px-4 py-3 text-right">POS card</th>
                <th className="px-4 py-3 text-right">Counted total</th>
                <th className="px-4 py-3 text-right">Difference</th>
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {shifts.map((s) => {
                const { finalTotal, difference } = shiftTotals(s);
                const balanced = Math.abs(difference) < 0.01;
                return (
                  <tr key={s.id} className="hover:bg-neutral-50/60">
                    <td className="whitespace-nowrap px-4 py-3 text-neutral-800">
                      {formatOrderTimestamp(s.closedAt)}
                      <div className="text-xs text-neutral-400">from {formatOrderTimestamp(s.openedAt)}</div>
                    </td>
                    <td className="px-4 py-3 text-neutral-600">{s.closedByName ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-600">
                      {s.orderCount}
                      {s.voidCount > 0 && <div className="text-xs text-rose-500">{s.voidCount} void</div>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatMoney(s.cashSales, currencySymbol)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatMoney(s.cardSales, currencySymbol)}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-neutral-900">{formatMoney(finalTotal, currencySymbol)}</td>
                    <td className={`px-4 py-3 text-right font-semibold tabular-nums ${balanced ? "text-emerald-600" : "text-rose-600"}`}>
                      {balanced ? "Balanced" : formatMoney(difference, currencySymbol)}
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-neutral-500" title={s.notes ?? ""}>
                      {s.notes || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Link href={`/shift-report/${s.id}`} title="View report" className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100">
                          <FileText className="h-4 w-4" />
                        </Link>
                        <button onClick={() => setEditShift(s)} title="Edit" className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => run(() => recalculateShiftAction(s.id), "Report recalculated from its orders.")}
                          disabled={pending}
                          title="Recalculate POS figures from its orders"
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() =>
                            setConfirm({
                              title: "Delete this End Day report?",
                              body: `The report closed ${formatOrderTimestamp(s.closedAt)} by ${s.closedByName ?? "staff"} is erased for good. Its orders stay. If it's the latest report, the next End Day will include those orders again.`,
                              run: () => deleteShiftRecordAction(s.id),
                            })
                          }
                          title="Delete"
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {shifts.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-neutral-400">
                    No End Day reports yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <button onClick={() => goDate(shiftDateKey(date, -1))} aria-label="Previous day" className="flex h-11 w-11 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <input
                type="date"
                value={date}
                onChange={(e) => e.target.value && goDate(e.target.value)}
                className="rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-base outline-none focus:border-[var(--brand)]"
              />
              <button onClick={() => goDate(shiftDateKey(date, 1))} aria-label="Next day" className="flex h-11 w-11 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50">
                <ChevronRight className="h-5 w-5" />
              </button>
              {date !== today && (
                <button onClick={() => goDate(today)} className="min-h-11 rounded-lg px-3.5 text-sm font-semibold text-teal-600 hover:bg-teal-50">
                  Today
                </button>
              )}
            </div>
            <div className="text-sm text-neutral-600">
              <b className="text-neutral-900">{live.length}</b> orders · <b className="text-neutral-900">{formatMoney(dayTotal, currencySymbol)}</b> · Cash{" "}
              {formatMoney(tender.cash, currencySymbol)} · Card {formatMoney(tender.card, currencySymbol)}
              {orders.length > live.length && <span className="text-neutral-400"> · {orders.length - live.length} voided</span>}
            </div>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="bg-neutral-50 text-left text-xs font-medium uppercase tracking-wide text-neutral-400">
                <tr>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Staff</th>
                  <th className="px-4 py-3">Items</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {orders.map((o) => {
                  const voided = o.status === "Voided";
                  return (
                    <tr key={o.id} className={`hover:bg-neutral-50/60 ${voided ? "text-neutral-400" : ""}`}>
                      <td className="whitespace-nowrap px-4 py-3">{formatOrderTimestamp(o.createdAt)}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-neutral-800">
                        #{o.orderNumber} <span className="font-normal text-neutral-400">· {orderSequence(o.orderNumber)}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {o.channel}
                        {o.tableNumber ? ` · T${String(o.tableNumber).padStart(2, "0")}` : ""}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">{o.createdByName ?? "—"}</td>
                      <td className="max-w-[180px] truncate px-4 py-3" title={o.items.map((i) => `${i.qty}x ${i.name}`).join(", ")}>
                        {o.items.map((i) => `${i.qty}x ${i.name}`).join(", ")}
                      </td>
                      <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums ${voided ? "line-through" : "text-neutral-900"}`}>
                        {formatMoney(orderTotal(o), currencySymbol)}
                      </td>
                      <td className="max-w-[170px] truncate px-4 py-3">{paymentLabel(o, currencySymbol)}</td>
                      <td className="px-4 py-3">
                        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${voided ? "bg-rose-50 text-rose-600" : o.paymentMethod ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                          {voided ? "Voided" : o.paymentMethod ? o.status : `${o.status}, unpaid`}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => setEditOrder(o)} title="Edit" className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() =>
                              setConfirm({
                                title: `Delete order #${o.orderNumber}?`,
                                body: `It's erased for good and drops out of the Till, Dashboard and Reports. End Day reports already closed keep their numbers until you recalculate them. Stock it used isn't put back.`,
                                run: () => deleteOrderRecordAction(o.id),
                              })
                            }
                            title="Delete"
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-neutral-400">
                      No orders on this day.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {editShift && (
        <ShiftEditModal
          shift={editShift}
          currencySymbol={currencySymbol}
          onClose={() => setEditShift(null)}
          onSaved={() => {
            setEditShift(null);
            setMessage("Report saved.");
            router.refresh();
          }}
        />
      )}
      {editOrder && (
        <OrderEditModal
          order={editOrder}
          paymentMethods={paymentMethods}
          currencySymbol={currencySymbol}
          onClose={() => setEditOrder(null)}
          onSaved={() => {
            setEditOrder(null);
            setMessage(`Order #${editOrder.orderNumber} saved. Recalculate its End Day report if it was already closed.`);
            router.refresh();
          }}
        />
      )}
      {confirm && (
        <Modal title={confirm.title} onClose={() => setConfirm(null)}>
          <p className="text-sm leading-relaxed text-neutral-600">{confirm.body}</p>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => setConfirm(null)} className="min-h-11 rounded-xl border border-neutral-200 px-4 text-sm font-semibold text-neutral-600 hover:bg-neutral-50">
              Cancel
            </button>
            <button
              onClick={() => {
                const c = confirm;
                setConfirm(null);
                run(c.run as () => Promise<{ error?: string } | void>, "Deleted.");
              }}
              className="min-h-11 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700"
            >
              Delete permanently
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className={`flex max-h-[92vh] w-full flex-col rounded-2xl bg-white shadow-xl ${wide ? "max-w-3xl" : "max-w-md"}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

function NumberField({ label, value, onChange, prefix }: { label: string; value: string; onChange: (v: string) => void; prefix?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-500">{label}</span>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">{prefix}</span>}
        <input
          type="number"
          min={0}
          step="0.01"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full rounded-lg border border-neutral-200 py-2.5 pr-3 text-base outline-none focus:border-teal-500 ${prefix ? "pl-7" : "pl-3"}`}
        />
      </div>
    </label>
  );
}

function TextField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-500">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-base outline-none focus:border-teal-500" />
    </label>
  );
}

function ShiftEditModal({ shift, currencySymbol, onClose, onSaved }: { shift: Shift; currencySymbol: string; onClose: () => void; onSaved: () => void }) {
  const methods = [...new Set([...(shift.terminalSales ?? []).map((t) => t.method), ...(shift.terminalCounts ?? []).map((t) => t.method)])].filter((m) => m !== "Cash");
  const [f, setF] = useState({
    closedByName: shift.closedByName ?? "",
    openingBalance: String(shift.openingBalance),
    cashCounted: String(shift.cashCounted),
    cashExpenses: String(shift.cashExpenses),
    cardExpenses: String(shift.cardExpenses),
    envelopeCash: String(shift.envelopeCash),
    notes: shift.notes ?? "",
  });
  const [counts, setCounts] = useState<Record<string, string>>(
    Object.fromEntries(methods.map((m) => [m, String(shift.terminalCounts?.find((c) => c.method === m)?.counted ?? 0)]))
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const draft = {
    cashCounted: Number(f.cashCounted) || 0,
    openingBalance: Number(f.openingBalance) || 0,
    cashExpenses: Number(f.cashExpenses) || 0,
    envelopeCash: Number(f.envelopeCash) || 0,
    terminalCounts: methods.map((m) => ({ method: m, counted: Number(counts[m]) || 0 })),
    cashSales: shift.cashSales,
    cardSales: shift.cardSales,
  };
  const { finalTotal, difference } = shiftTotals(draft);

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await updateShiftRecordAction(shift.id, {
        closedByName: f.closedByName,
        openingBalance: draft.openingBalance,
        cashCounted: draft.cashCounted,
        terminalCounts: draft.terminalCounts,
        cashExpenses: draft.cashExpenses,
        cardExpenses: Number(f.cardExpenses) || 0,
        envelopeCash: draft.envelopeCash,
        notes: f.notes,
      });
      if (res.error) setError(res.error);
      else onSaved();
    });
  }

  return (
    <Modal title={`End Day report · ${formatOrderTimestamp(shift.closedAt)}`} onClose={onClose} wide>
      <p className="mb-4 text-sm text-neutral-500">
        POS figures for this period: cash {formatMoney(shift.cashSales, currencySymbol)}, card {formatMoney(shift.cardSales, currencySymbol)}, {shift.orderCount} orders. Edit what
        was counted; use Recalculate in the table if the orders themselves changed.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Closed by" value={f.closedByName} onChange={(v) => setF({ ...f, closedByName: v })} />
        <NumberField label="Opening float" prefix={currencySymbol} value={f.openingBalance} onChange={(v) => setF({ ...f, openingBalance: v })} />
        <NumberField label="Cash counted in drawer" prefix={currencySymbol} value={f.cashCounted} onChange={(v) => setF({ ...f, cashCounted: v })} />
        <NumberField label="Cash put in envelope" prefix={currencySymbol} value={f.envelopeCash} onChange={(v) => setF({ ...f, envelopeCash: v })} />
        <NumberField label="Cash expenses" prefix={currencySymbol} value={f.cashExpenses} onChange={(v) => setF({ ...f, cashExpenses: v })} />
        <NumberField label="Card expenses" prefix={currencySymbol} value={f.cardExpenses} onChange={(v) => setF({ ...f, cardExpenses: v })} />
        {methods.map((m) => (
          <NumberField key={m} label={`${m} — settled`} prefix={currencySymbol} value={counts[m] ?? "0"} onChange={(v) => setCounts({ ...counts, [m]: v })} />
        ))}
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-neutral-500">Notes</span>
          <textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={2} className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-base outline-none focus:border-teal-500" />
        </label>
      </div>
      <div className="mt-4 flex items-center justify-between rounded-xl bg-neutral-50 px-4 py-3 text-sm">
        <span>
          Counted total <b>{formatMoney(finalTotal, currencySymbol)}</b>
        </span>
        <span className={Math.abs(difference) < 0.01 ? "font-semibold text-emerald-600" : "font-semibold text-rose-600"}>
          {Math.abs(difference) < 0.01 ? "Balanced" : `Difference ${formatMoney(difference, currencySymbol)}`}
        </span>
      </div>
      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="min-h-11 rounded-xl border border-neutral-200 px-4 text-sm font-semibold text-neutral-600 hover:bg-neutral-50">
          Cancel
        </button>
        <button onClick={save} disabled={pending} className="min-h-11 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:opacity-50">
          {pending ? "Saving…" : "Save report"}
        </button>
      </div>
    </Modal>
  );
}

type ItemRow = { key: string; lineId?: string; dishId?: string; taxRate?: number; name: string; qty: string; price: string };
type PayRow = { key: string; method: string; amount: string };

function OrderEditModal({
  order,
  paymentMethods,
  currencySymbol,
  onClose,
  onSaved,
}: {
  order: Order;
  paymentMethods: string[];
  currencySymbol: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [when, setWhen] = useState(toLocalInput(order.createdAt));
  const [channel, setChannel] = useState<OrderChannel>(order.channel);
  const [table, setTable] = useState(order.tableNumber ? String(order.tableNumber) : "");
  const [guests, setGuests] = useState(String(order.guests));
  const [customerName, setCustomerName] = useState(order.customerName ?? "");
  const [customerPhone, setCustomerPhone] = useState(order.customerPhone ?? "");
  const [customerAddress, setCustomerAddress] = useState(order.customerAddress ?? "");
  const [staff, setStaff] = useState(order.createdByName ?? "");
  const [items, setItems] = useState<ItemRow[]>(
    order.items.map((i, n) => ({ key: `i${n}`, lineId: i.lineId, dishId: i.dishId, taxRate: i.taxRate, name: i.name, qty: String(i.qty), price: String(i.price) }))
  );
  const [extraDiscount, setExtraDiscount] = useState(String(order.extraDiscount ?? 0));
  const initialPayments = order.payments?.length ? order.payments : order.paymentMethod ? [{ method: order.paymentMethod, amount: orderTotal(order) }] : [];
  const [payments, setPayments] = useState<PayRow[]>(initialPayments.map((p, n) => ({ key: `p${n}`, method: p.method, amount: String(p.amount) })));
  const [cashReceived, setCashReceived] = useState(order.cashReceived ? String(order.cashReceived) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [nextKey, setNextKey] = useState(1);

  const methods = [...new Set([...paymentMethods, ...payments.map((p) => p.method)])];
  const liveItems = items.filter((i) => i.name.trim()).map((i) => ({ dishId: i.dishId ?? i.key, name: i.name, qty: Number(i.qty) || 0, price: Number(i.price) || 0, taxRate: i.taxRate }));
  const total = orderTotal({ items: liveItems, extraDiscount: Number(extraDiscount) || 0, couponDiscount: order.couponDiscount ?? 0 });
  const paid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const remaining = Math.round((total - paid) * 100) / 100;

  function save() {
    setError(null);
    const ms = new Date(when).getTime();
    startTransition(async () => {
      const res = await updateOrderRecordAction(order.id, {
        createdAt: ms,
        channel,
        tableNumber: table ? Number(table) : null,
        guests: Number(guests) || 1,
        customerName,
        customerPhone,
        customerAddress,
        createdByName: staff,
        items: items.map((i) => ({ lineId: i.lineId, dishId: i.dishId, name: i.name, qty: Number(i.qty), price: Number(i.price) })),
        extraDiscount: Number(extraDiscount) || 0,
        payments: payments.map((p) => ({ method: p.method, amount: Number(p.amount) || 0 })),
        cashReceived: cashReceived ? Number(cashReceived) : null,
      });
      if (res.error) setError(res.error);
      else onSaved();
    });
  }

  const seated = channel === "Dine in" || channel === "Wait List";

  return (
    <Modal title={`Edit order #${order.orderNumber}`} onClose={onClose} wide>
      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-400">Details</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField label="Date & time" type="datetime-local" value={when} onChange={setWhen} />
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-500">Order type</span>
            <select value={channel} onChange={(e) => setChannel(e.target.value as OrderChannel)} className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-base outline-none focus:border-teal-500">
              {CHANNELS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <TextField label="Staff" value={staff} onChange={setStaff} />
          {seated && <TextField label="Table number" type="number" value={table} onChange={setTable} />}
          {seated && <TextField label="Guests" type="number" value={guests} onChange={setGuests} />}
          <TextField label="Customer name" value={customerName} onChange={setCustomerName} />
          <TextField label="Customer phone" value={customerPhone} onChange={setCustomerPhone} />
          {channel === "Delivery" && <TextField label="Delivery address" value={customerAddress} onChange={setCustomerAddress} />}
        </div>
      </section>

      <section className="mt-5">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-400">Items &amp; prices</h3>
        <div className="space-y-2">
          {items.map((it) => (
            <div key={it.key} className="grid grid-cols-[1fr_70px_100px_40px] gap-2">
              <input value={it.name} onChange={(e) => setItems(items.map((x) => (x.key === it.key ? { ...x, name: e.target.value } : x)))} aria-label="Item name" className="rounded-lg border border-neutral-200 px-3 py-2 text-base outline-none focus:border-teal-500" />
              <input type="number" min={1} value={it.qty} onChange={(e) => setItems(items.map((x) => (x.key === it.key ? { ...x, qty: e.target.value } : x)))} aria-label="Quantity" className="rounded-lg border border-neutral-200 px-2 py-2 text-base outline-none focus:border-teal-500" />
              <input type="number" min={0} step="0.01" value={it.price} onChange={(e) => setItems(items.map((x) => (x.key === it.key ? { ...x, price: e.target.value } : x)))} aria-label="Price each" className="rounded-lg border border-neutral-200 px-2 py-2 text-base outline-none focus:border-teal-500" />
              <button onClick={() => setItems(items.filter((x) => x.key !== it.key))} aria-label="Remove item" className="flex items-center justify-center rounded-lg text-neutral-400 hover:bg-rose-50 hover:text-rose-500">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <button
            onClick={() => {
              setItems([...items, { key: `n${nextKey}`, name: "", qty: "1", price: "0" }]);
              setNextKey(nextKey + 1);
            }}
            className="flex min-h-10 items-center gap-1.5 rounded-lg border border-dashed border-neutral-300 px-3 text-sm font-medium text-neutral-500 hover:border-teal-400 hover:text-teal-600"
          >
            <Plus className="h-4 w-4" /> Add item
          </button>
          <div className="w-44">
            <NumberField label="Extra discount" prefix={currencySymbol} value={extraDiscount} onChange={setExtraDiscount} />
          </div>
        </div>
        {(order.couponDiscount ?? 0) > 0 && <p className="mt-2 text-xs text-neutral-400">Coupon {order.couponCode} −{formatMoney(order.couponDiscount, currencySymbol)} stays applied.</p>}
      </section>

      <section className="mt-5">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-400">Payment</h3>
        <div className="space-y-2">
          {payments.map((p) => (
            <div key={p.key} className="grid grid-cols-[1fr_130px_40px] gap-2">
              <select value={p.method} onChange={(e) => setPayments(payments.map((x) => (x.key === p.key ? { ...x, method: e.target.value } : x)))} className="rounded-lg border border-neutral-200 px-3 py-2 text-base outline-none focus:border-teal-500">
                {methods.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
              <input type="number" min={0} step="0.01" value={p.amount} onChange={(e) => setPayments(payments.map((x) => (x.key === p.key ? { ...x, amount: e.target.value } : x)))} aria-label="Amount" className="rounded-lg border border-neutral-200 px-2 py-2 text-base outline-none focus:border-teal-500" />
              <button onClick={() => setPayments(payments.filter((x) => x.key !== p.key))} aria-label="Remove payment" className="flex items-center justify-center rounded-lg text-neutral-400 hover:bg-rose-50 hover:text-rose-500">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <button
            onClick={() => {
              setPayments([...payments, { key: `n${nextKey}`, method: methods[0] ?? "Cash", amount: String(Math.max(0, remaining)) }]);
              setNextKey(nextKey + 1);
            }}
            className="flex min-h-10 items-center gap-1.5 rounded-lg border border-dashed border-neutral-300 px-3 text-sm font-medium text-neutral-500 hover:border-teal-400 hover:text-teal-600"
          >
            <Plus className="h-4 w-4" /> Add payment
          </button>
          {payments.some((p) => p.method === "Cash") && (
            <div className="w-44">
              <NumberField label="Cash received" prefix={currencySymbol} value={cashReceived} onChange={setCashReceived} />
            </div>
          )}
        </div>
      </section>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-neutral-50 px-4 py-3 text-sm">
        <span>
          Total <b>{formatMoney(total, currencySymbol)}</b> · Paid {formatMoney(paid, currencySymbol)}
        </span>
        <span className={Math.abs(remaining) < 0.01 ? "font-semibold text-emerald-600" : "font-semibold text-amber-600"}>
          {Math.abs(remaining) < 0.01 ? "Fully paid" : remaining > 0 ? `${formatMoney(remaining, currencySymbol)} not paid` : `Overpaid ${formatMoney(-remaining, currencySymbol)}`}
        </span>
      </div>
      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="min-h-11 rounded-xl border border-neutral-200 px-4 text-sm font-semibold text-neutral-600 hover:bg-neutral-50">
          Cancel
        </button>
        <button onClick={save} disabled={pending} className="min-h-11 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:opacity-50">
          {pending ? "Saving…" : "Save order"}
        </button>
      </div>
    </Modal>
  );
}
