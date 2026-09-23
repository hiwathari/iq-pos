"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Order, OrderStatus } from "@/lib/types";
import { setOrderStatusAction, toggleOrderItemReadyAction, voidOrderAction } from "@/lib/actions/orders";
import { Ban, Bike, Check, CheckCircle2, ChefHat, Clock, MapPin, Phone, ShoppingBag, X } from "lucide-react";

const COLUMNS: { statuses: OrderStatus[]; label: string; accent: string; showTimer: boolean }[] = [
  { statuses: ["Wait List", "In Kitchen"], label: "Pending", accent: "border-t-amber-400", showTimer: true },
  { statuses: ["Ready"], label: "Ready", accent: "border-t-teal-500", showTimer: true },
  { statuses: ["Served"], label: "Completed", accent: "border-t-neutral-300", showTimer: false },
];

export function KitchenClient({ orders, timerLimitMinutes }: { orders: Order[]; timerLimitMinutes: number }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [voidTarget, setVoidTarget] = useState<Order | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  function advance(orderId: string, status: OrderStatus) {
    startTransition(async () => {
      await setOrderStatusAction(orderId, status);
      router.refresh();
    });
  }

  function toggleItem(orderId: string, dishId: string, ready: boolean) {
    startTransition(async () => {
      await toggleOrderItemReadyAction(orderId, dishId, ready);
      router.refresh();
    });
  }

  function confirmVoid(reason: string) {
    if (!voidTarget) return;
    const id = voidTarget.id;
    setVoidTarget(null);
    startTransition(async () => {
      await voidOrderAction(id, reason);
      router.refresh();
    });
  }

  const voided = orders.filter((o) => o.status === "Voided");

  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-100 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-bold text-neutral-900">
          <ChefHat className="h-6 w-6 text-teal-600" /> Kitchen Display
        </h1>
        {voided.length > 0 && (
          <span className="flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1.5 text-xs font-semibold text-rose-700">
            <Ban className="h-3.5 w-3.5" /> {voided.length} voided today
          </span>
        )}
      </div>

      <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden md:grid-cols-3">
        {COLUMNS.map((col) => {
          const columnOrders = orders.filter((o) => col.statuses.includes(o.status));
          return (
            <div key={col.label} className="flex min-h-0 flex-col rounded-2xl bg-white">
              <div className={`flex items-center justify-between border-t-4 ${col.accent} rounded-t-2xl px-4 py-3`}>
                <span className="text-base font-bold text-neutral-900">{col.label}</span>
                <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-neutral-100 px-2 text-sm font-bold text-neutral-600">
                  {columnOrders.length}
                </span>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-3">
                {columnOrders.length === 0 && (
                  <div className="flex h-24 items-center justify-center text-sm text-neutral-300">No orders</div>
                )}
                {columnOrders.map((order) => (
                  <OrderTicket
                    key={order.id}
                    order={order}
                    now={col.showTimer ? now : null}
                    timerLimitMinutes={timerLimitMinutes}
                    onAdvance={(status) => advance(order.id, status)}
                    onToggleItem={(dishId, ready) => toggleItem(order.id, dishId, ready)}
                    onVoid={() => setVoidTarget(order)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {voidTarget && <VoidModal order={voidTarget} onCancel={() => setVoidTarget(null)} onConfirm={confirmVoid} />}
    </div>
  );
}

const TIMER_STYLES = {
  green: "bg-emerald-100 text-emerald-700",
  yellow: "bg-yellow-100 text-yellow-700",
  orange: "bg-orange-100 text-orange-700",
  red: "bg-rose-100 text-rose-700 animate-pulse",
} as const;

function timerBand(elapsedMs: number, limitMinutes: number) {
  const fraction = elapsedMs / (limitMinutes * 60_000);
  if (fraction >= 1) return "red";
  if (fraction >= 0.75) return "orange";
  if (fraction >= 0.5) return "yellow";
  return "green";
}

function formatElapsed(elapsedMs: number) {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function OrderTicket({
  order,
  now,
  timerLimitMinutes,
  onAdvance,
  onToggleItem,
  onVoid,
}: {
  order: Order;
  now: number | null;
  timerLimitMinutes: number;
  onAdvance: (status: OrderStatus) => void;
  onToggleItem: (dishId: string, ready: boolean) => void;
  onVoid: () => void;
}) {
  const elapsedMs = now !== null ? now - order.createdAt : null;
  const band = elapsedMs !== null ? timerBand(elapsedMs, timerLimitMinutes) : null;
  const itemsCheckable = order.status === "In Kitchen";
  const allItemsReady = order.items.every((i) => i.ready);

  return (
    <div
      className={`rounded-xl border p-3.5 shadow-sm ${
        order.channel === "Delivery" ? "border-blue-200 bg-blue-50/40" : "border-neutral-200"
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-base font-bold text-neutral-900">#{order.orderNumber}</span>
        {elapsedMs !== null && band ? (
          <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${TIMER_STYLES[band]}`}>
            <Clock className="h-3.5 w-3.5" /> {formatElapsed(elapsedMs)}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs font-medium text-neutral-400">
            <Clock className="h-3.5 w-3.5" /> {order.createdLabel}
          </span>
        )}
      </div>

      {order.channel === "Delivery" && (
        <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700">
          <Bike className="h-3.5 w-3.5" /> DELIVERY
        </div>
      )}
      {order.channel === "Take Away" && (
        <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">
          <ShoppingBag className="h-3.5 w-3.5" /> TAKEAWAY
        </div>
      )}

      <div className="mb-3 text-xs font-semibold text-neutral-500">
        {order.tableNumber ? `Table ${String(order.tableNumber).padStart(2, "0")}` : order.channel}
        {order.thirdPartyProvider ? ` · ${order.thirdPartyProvider}` : ""}
      </div>

      {(order.customerName || order.customerPhone || order.customerAddress) && (
        <div className="mb-3 space-y-1 rounded-lg bg-neutral-50 px-2.5 py-2 text-xs text-neutral-600">
          {order.customerName && <div className="font-semibold text-neutral-800">{order.customerName}</div>}
          {order.customerPhone && (
            <div className="flex items-center gap-1.5">
              <Phone className="h-3 w-3 shrink-0" /> {order.customerPhone}
            </div>
          )}
          {order.customerAddress && (
            <div className="flex items-start gap-1.5">
              <MapPin className="h-3 w-3 shrink-0 translate-y-0.5" /> {order.customerAddress}
            </div>
          )}
        </div>
      )}

      <ul className="mb-3 space-y-1">
        {order.items.map((item) =>
          itemsCheckable ? (
            <li key={item.dishId}>
              <button
                onClick={() => onToggleItem(item.dishId, !item.ready)}
                className="flex w-full items-start gap-2 rounded-lg py-1 text-left text-sm hover:bg-neutral-50"
              >
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    item.ready ? "border-teal-600 bg-teal-600 text-white" : "border-neutral-300"
                  }`}
                >
                  {item.ready && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                <span className="min-w-0">
                  <span className={`font-bold ${item.ready ? "text-neutral-300" : "text-teal-600"}`}>{item.qty}× </span>
                  <span className={item.ready ? "text-neutral-400 line-through" : "text-neutral-800"}>{item.name}</span>
                  {item.note && <div className="text-xs font-semibold italic text-amber-600">↳ {item.note}</div>}
                </span>
              </button>
            </li>
          ) : (
            <li key={item.dishId} className="text-sm">
              <span className="font-bold text-teal-600">{item.qty}× </span>
              <span className={item.ready ? "text-neutral-400 line-through" : "text-neutral-800"}>{item.name}</span>
              {item.note && <div className="ml-4 text-xs font-semibold italic text-amber-600">↳ {item.note}</div>}
            </li>
          )
        )}
      </ul>
      <div className="flex gap-2">
        {order.status === "In Kitchen" && (
          <button
            onClick={() => onAdvance("Ready")}
            disabled={!allItemsReady}
            title={allItemsReady ? undefined : "Tick off every item first"}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-teal-600 py-3 text-sm font-bold text-white active:scale-95 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400"
          >
            <CheckCircle2 className="h-4 w-4" /> Mark Order Ready
          </button>
        )}
        {order.status === "Wait List" && (
          <button
            onClick={() => onAdvance("In Kitchen")}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-500 py-3 text-sm font-bold text-white active:scale-95"
          >
            Send to Kitchen
          </button>
        )}
        {order.status === "Ready" && (
          <button
            onClick={() => onAdvance("Served")}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-neutral-800 py-3 text-sm font-bold text-white active:scale-95"
          >
            <CheckCircle2 className="h-4 w-4" /> Complete
          </button>
        )}
        {order.status !== "Served" && (
          <button
            onClick={onVoid}
            className="flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-rose-600 active:scale-95"
          >
            <Ban className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function VoidModal({
  order,
  onCancel,
  onConfirm,
}: {
  order: Order;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Void Order #{order.orderNumber}</h2>
          <button onClick={onCancel} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <label className="mb-1.5 block text-xs font-medium text-neutral-500">Reason (optional)</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="e.g. Customer changed mind, kitchen error…"
          className="mb-4 w-full resize-none rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
        />
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-neutral-200 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason)}
            className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white hover:bg-rose-700"
          >
            Void Order
          </button>
        </div>
      </div>
    </div>
  );
}
