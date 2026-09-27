"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  formatOrderTimestamp,
  orderSequence,
  type Category,
  type Dish,
  type Order,
  type OrderItem,
  type OrderStatus,
  type Printer,
  type PrinterStation,
} from "@/lib/types";
import { setOrderStatusAction, toggleOrderItemReadyAction, voidOrderAction } from "@/lib/actions/orders";
import { setDishStockAction } from "@/lib/actions/menu";
import {
  Ban,
  Bike,
  Check,
  CheckCircle2,
  ChefHat,
  Clock,
  MapPin,
  Minus,
  Phone,
  Plus,
  RefreshCw,
  ShoppingBag,
  X,
  XCircle,
  PackageX,
  Radio,
} from "lucide-react";

// The canonical station order the selector and any station badges are shown in.
const STATION_ORDER: PrinterStation[] = ["Kitchen", "Bar", "Expo", "Receipt"];
const STATION_KEY = "kds-station";

// Served and voided tickets share one "Completed" column (green for served, red for voided)
// and each only needs a brief moment there for staff to double-check — 30 seconds after being
// done, a ticket drops off on its own so the column doesn't pile up with old tickets. The
// Till's history keeps the full audit trail indefinitely regardless.
const DONE_RETENTION_MS = 30_000;

function doneAt(order: Order) {
  return order.status === "Voided" ? (order.voidedAt ?? order.createdAt) : (order.servedAt ?? order.createdAt);
}

// How much bigger/smaller the whole board renders — a per-device preference (not tied to the
// restaurant), since it depends on that screen's size and how far staff stand from it.
const FONT_SCALE_KEY = "kds-font-scale";
const FONT_SCALE_STEPS = [0.85, 1, 1.15, 1.3, 1.5, 1.7];
const DEFAULT_FONT_SCALE_INDEX = 1;

const COLUMNS: { statuses: OrderStatus[]; label: string; accent: string; showTimer: boolean }[] = [
  { statuses: ["Wait List", "In Kitchen"], label: "Pending", accent: "border-t-amber-400", showTimer: true },
  { statuses: ["Ready"], label: "Ready", accent: "border-t-teal-500", showTimer: true },
  { statuses: ["Served", "Voided"], label: "Completed", accent: "border-t-neutral-300", showTimer: false },
];

export function KitchenClient({
  orders,
  categories,
  dishes,
  printers,
  timerLimitMinutes,
}: {
  orders: Order[];
  categories: Category[];
  dishes: Dish[];
  printers: Printer[];
  timerLimitMinutes: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [voidTarget, setVoidTarget] = useState<Order | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [fontScaleIndex, setFontScaleIndex] = useState(DEFAULT_FONT_SCALE_INDEX);
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [station, setStation] = useState<PrinterStation | "All">("All");

  // Which stations this restaurant actually has printers for — a restaurant running a single
  // Kitchen printer never sees a selector at all, since there's nothing to route between yet.
  const availableStations = useMemo(
    () => STATION_ORDER.filter((s) => printers.some((p) => p.station === s)),
    [printers]
  );

  const dishesById = useMemo(() => new Map(dishes.map((d) => [d.id, d])), [dishes]);
  const categoriesById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const printersById = useMemo(() => new Map(printers.map((p) => [p.id, p])), [printers]);

  // Resolves the physical station an item routes to — per-dish printer, falling back to its
  // category's printer, same precedence as everywhere else this pairing is used (Till, Manage
  // Dishes). A custom/unlisted item resolves to null and is treated as unrouted, never hidden.
  function resolveItemStation(item: OrderItem): PrinterStation | null {
    const dish = dishesById.get(item.dishId);
    const printerId = dish?.printerId ?? (dish ? categoriesById.get(dish.categoryId)?.printerId : undefined);
    if (!printerId) return null;
    return printersById.get(printerId)?.station ?? null;
  }

  function itemMatchesStation(item: OrderItem) {
    if (station === "All") return true;
    const itemStation = resolveItemStation(item);
    return itemStation === null || itemStation === station;
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FONT_SCALE_KEY);
      if (raw === null) return;
      const stored = Number(raw);
      // Deferred a tick so this doesn't set state synchronously within the effect body.
      if (FONT_SCALE_STEPS[stored] !== undefined) setTimeout(() => setFontScaleIndex(stored), 0);
    } catch {
      // Storage unavailable (private mode, locked-down kiosk browser) — just use the default.
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STATION_KEY);
      if (raw && (raw === "All" || STATION_ORDER.includes(raw as PrinterStation))) {
        setTimeout(() => setStation(raw as PrinterStation | "All"), 0);
      }
    } catch {
      // Storage unavailable — this screen just shows every station, same as before.
    }
  }, []);

  function selectStation(next: PrinterStation | "All") {
    setStation(next);
    try {
      localStorage.setItem(STATION_KEY, next);
    } catch {
      // Ignore — the selection still applies for this session even if it can't be remembered.
    }
  }

  function adjustFontScale(delta: 1 | -1) {
    setFontScaleIndex((prev) => {
      const next = Math.min(FONT_SCALE_STEPS.length - 1, Math.max(0, prev + delta));
      try {
        localStorage.setItem(FONT_SCALE_KEY, String(next));
      } catch {
        // Ignore — the size still applies for this session even if it can't be remembered.
      }
      return next;
    });
  }

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Poll for new/updated orders placed from the Till so they show up here without a manual refresh.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(id);
  }, [router]);

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

  function toggleStock(dish: Dish) {
    startTransition(async () => {
      await setDishStockAction(dish.id, !dish.outOfStock);
      router.refresh();
    });
  }

  const outOfStockCount = dishes.filter((d) => d.outOfStock).length;

  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-100 p-4" style={{ zoom: FONT_SCALE_STEPS[fontScaleIndex] }}>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-bold text-neutral-900">
          <ChefHat className="h-6 w-6 text-[var(--brand)]" /> Kitchen Display
          {station !== "All" && (
            <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-bold text-teal-700">{station}</span>
          )}
        </h1>
        <div className="flex items-center gap-3">
          {availableStations.length > 0 && (
            <div className="flex items-center gap-1 rounded-xl border border-neutral-200 bg-white p-1" title="This screen's station — remembered on this device">
              <Radio className="ml-1.5 h-4 w-4 text-neutral-400" />
              <button
                onClick={() => selectStation("All")}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                  station === "All" ? "bg-[var(--brand)] text-white" : "text-neutral-500 hover:bg-neutral-50"
                }`}
              >
                All
              </button>
              {availableStations.map((s) => (
                <button
                  key={s}
                  onClick={() => selectStation(s)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                    station === s ? "bg-[var(--brand)] text-white" : "text-neutral-500 hover:bg-neutral-50"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => setStockModalOpen(true)}
            className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-semibold ${
              outOfStockCount > 0
                ? "border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
                : "border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50"
            }`}
          >
            <PackageX className="h-4 w-4" /> Stock{outOfStockCount > 0 ? ` (${outOfStockCount} out)` : ""}
          </button>
          <div className="flex items-center gap-1 rounded-xl border border-neutral-200 bg-white p-1">
            <button
              onClick={() => adjustFontScale(-1)}
              disabled={fontScaleIndex === 0}
              title="Smaller text"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-50 disabled:opacity-30"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-10 text-center text-xs font-semibold text-neutral-500">
              {Math.round(FONT_SCALE_STEPS[fontScaleIndex] * 100)}%
            </span>
            <button
              onClick={() => adjustFontScale(1)}
              disabled={fontScaleIndex === FONT_SCALE_STEPS.length - 1}
              title="Bigger text"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-50 disabled:opacity-30"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden md:grid-cols-3">
        {COLUMNS.map((col) => {
          let columnOrders = orders.filter((o) => col.statuses.includes(o.status));
          if (col.label === "Completed") {
            columnOrders = columnOrders
              .filter((o) => now - doneAt(o) < DONE_RETENTION_MS)
              .sort((a, b) => doneAt(b) - doneAt(a));
          }
          // A ticket only belongs on this station's screen if it has at least one item that
          // routes here (or is unrouted) — an all-drinks order never shows up on the Kitchen screen.
          if (station !== "All") {
            columnOrders = columnOrders.filter((o) => o.items.some(itemMatchesStation));
          }
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
                    station={station}
                    itemMatchesStation={itemMatchesStation}
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
      {stockModalOpen && (
        <StockModal categories={categories} dishes={dishes} onToggle={toggleStock} onClose={() => setStockModalOpen(false)} />
      )}
    </div>
  );
}

function StockModal({
  categories,
  dishes,
  onToggle,
  onClose,
}: {
  categories: Category[];
  dishes: Dish[];
  onToggle: (dish: Dish) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-bold text-neutral-900">
            <PackageX className="h-5 w-5 text-rose-500" /> Menu Stock
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="border-b border-neutral-100 px-5 py-2.5 text-xs text-neutral-400">
          Mark an item out of stock the moment it runs out — the Till stops taking new orders for it immediately.
        </p>
        <div className="flex-1 overflow-y-auto p-3">
          {categories.map((category) => {
            const categoryDishes = dishes.filter((d) => d.categoryId === category.id);
            if (categoryDishes.length === 0) return null;
            return (
              <div key={category.id} className="mb-3">
                <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">{category.name}</div>
                {categoryDishes.map((dish) => (
                  <button
                    key={dish.id}
                    onClick={() => onToggle(dish)}
                    className="flex w-full items-center justify-between rounded-xl px-2.5 py-2.5 text-left hover:bg-neutral-50"
                  >
                    <span className={`text-sm font-medium ${dish.outOfStock ? "text-neutral-400 line-through" : "text-neutral-800"}`}>
                      {dish.name}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                        dish.outOfStock ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {dish.outOfStock ? "Out of Stock" : "In Stock"}
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
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
  station,
  itemMatchesStation,
  onAdvance,
  onToggleItem,
  onVoid,
}: {
  order: Order;
  now: number | null;
  timerLimitMinutes: number;
  station: PrinterStation | "All";
  itemMatchesStation: (item: OrderItem) => boolean;
  onAdvance: (status: OrderStatus) => void;
  onToggleItem: (dishId: string, ready: boolean) => void;
  onVoid: () => void;
}) {
  const elapsedMs = now !== null ? now - order.createdAt : null;
  const band = elapsedMs !== null ? timerBand(elapsedMs, timerLimitMinutes) : null;
  const itemsCheckable = order.status === "In Kitchen";
  const allItemsReady = order.items.every((i) => i.ready);
  const isVoided = order.status === "Voided";
  const isDone = order.status === "Served";
  // Flags a ticket that was edited (items/table/etc. changed) after being sent, so kitchen
  // notices the change — cleared once it's done (Served/Voided), since it no longer matters.
  const wasUpdated = !!order.updatedAt && order.status !== "Served" && order.status !== "Voided";
  // On a single station's screen, only that station's items show — the rest of the ticket
  // belongs to another screen. Whole-ticket actions (void, advance) stay in the "All" view only,
  // since a bar screen shouldn't be the one deciding a whole dine-in order is void or served.
  const visibleItems = station === "All" ? order.items : order.items.filter(itemMatchesStation);
  const hiddenItemCount = order.items.length - visibleItems.length;
  const showTicketActions = station === "All";

  return (
    <div
      className={`rounded-xl border p-3.5 shadow-sm ${
        isVoided
          ? "border-rose-200 bg-rose-50/60 opacity-75"
          : isDone
            ? "border-emerald-200 bg-emerald-50/50"
            : order.channel === "Delivery"
              ? "border-blue-200 bg-blue-50/40"
              : "border-neutral-200"
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-base font-bold text-neutral-900">
          {isVoided && <XCircle className="h-4 w-4 text-rose-500" />}
          <span className={isVoided ? "line-through decoration-rose-400" : undefined}>#{order.orderNumber}</span>
        </span>
        {isVoided ? (
          <span className="flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">
            <Ban className="h-3.5 w-3.5" /> Voided
          </span>
        ) : isDone ? (
          <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> Completed
          </span>
        ) : elapsedMs !== null && band ? (
          <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${TIMER_STYLES[band]}`}>
            <Clock className="h-3.5 w-3.5" /> {formatElapsed(elapsedMs)}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs font-medium text-neutral-400">
            <Clock className="h-3.5 w-3.5" /> {formatOrderTimestamp(order.createdAt)}
          </span>
        )}
      </div>
      <div className="mb-2 text-xs font-medium text-neutral-400">Seq {orderSequence(order.orderNumber)}</div>

      {isVoided && (
        <div className="mb-2 rounded-lg bg-rose-100 px-2.5 py-1.5 text-xs font-semibold text-rose-700">
          Cancelled{order.voidReason ? ` — ${order.voidReason}` : ""}
        </div>
      )}

      {wasUpdated && (
        <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">
          <RefreshCw className="h-3.5 w-3.5" /> UPDATED — recheck the items below
        </div>
      )}

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
        {order.tableNumber
          ? `Table ${String(order.tableNumber).padStart(2, "0")}${
              order.mergedTableNumbers?.length ? ` + ${order.mergedTableNumbers.join(" + ")}` : ""
            }`
          : order.channel}
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
        {visibleItems.map((item) =>
          itemsCheckable ? (
            <li key={item.dishId}>
              <button
                onClick={() => onToggleItem(item.dishId, !item.ready)}
                className="flex w-full items-center justify-between gap-2 rounded-lg py-1.5 text-left text-sm hover:bg-neutral-50"
              >
                <span className="min-w-0">
                  <span className={`font-bold ${item.ready ? "text-neutral-300" : "text-teal-600"}`}>{item.qty}× </span>
                  <span className={item.ready ? "text-neutral-400 line-through" : "text-neutral-800"}>{item.name}</span>
                  {item.note && <div className="text-xs font-semibold italic text-amber-600">↳ {item.note}</div>}
                </span>
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 ${
                    item.ready ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-neutral-300"
                  }`}
                >
                  {item.ready && <Check className="h-4 w-4" strokeWidth={3} />}
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
      {hiddenItemCount > 0 && (
        <div className="mb-3 text-xs italic text-neutral-400">
          +{hiddenItemCount} more item{hiddenItemCount === 1 ? "" : "s"} on another station
        </div>
      )}
      {!isVoided && showTicketActions && (
        <div className="flex gap-2">
          {order.status === "In Kitchen" && (
            <button
              onClick={() => onAdvance("Ready")}
              disabled={!allItemsReady}
              title={allItemsReady ? undefined : "Tick off every item first"}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--brand)] py-3 text-sm font-bold text-white active:scale-95 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400"
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
              <CheckCircle2 className="h-4 w-4" /> Mark Served
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
      )}
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
