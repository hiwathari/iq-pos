"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
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
import { completeOrderAction, setOrderStatusAction, toggleOrderItemReadyAction } from "@/lib/actions/orders";
import { setDishStockAction } from "@/lib/actions/menu";
import { unlockOrderAudio, playNewOrderChime, playOrderReadyChime } from "@/lib/order-sounds";
import { businessDayStart } from "@/lib/business-day";
import {
  Check,
  CheckCheck,
  CheckCircle2,
  ChefHat,
  MapPin,
  Minus,
  Phone,
  Plus,
  RefreshCw,
  X,
  XCircle,
  PackageX,
  Radio,
} from "lucide-react";

// The canonical station order the selector and any station badges are shown in.
const STATION_ORDER: PrinterStation[] = ["Kitchen", "Bar", "Expo", "Receipt"];
const STATION_KEY = "kds-station";

// Served and voided tickets share one "Completed" column (green/red) — every one from today
// stays listed there, scrollable, so staff can look back at what left the kitchen without
// leaving this screen. Resets at the restaurant's business-day boundary (see businessDayStart —
// follows its configured opening time, matching the day-rollover elsewhere, e.g.
// autoVoidStaleOrders) rather than growing forever; the Till's history keeps the full audit trail
// indefinitely regardless. "Ready" is kept in COMPLETED_STATUSES only for any pre-existing order
// still sitting in that state from before ready-equals-served shipped — nothing sets it anymore
// (see completeOrderAction/toggleOrderItemReadyAction/the ticket's own action button below, all
// of which go straight to "Served").
function doneAt(order: Order) {
  return order.status === "Voided" ? (order.voidedAt ?? order.createdAt) : (order.servedAt ?? order.createdAt);
}

// How much bigger/smaller the whole board renders — a per-device preference (not tied to the
// restaurant), since it depends on that screen's size and how far staff stand from it.
const FONT_SCALE_KEY = "kds-font-scale";
const FONT_SCALE_STEPS = [0.85, 1, 1.15, 1.3, 1.5, 1.7];
const DEFAULT_FONT_SCALE_INDEX = 1;

// Kitchen only needs two boards: tickets still to prep ("Pending" — Wait List + In Kitchen) and
// everything finished today ("Completed" — Served + Voided, plus any legacy "Ready" order — see
// doneAt above). There's no separate "mark as served" step: once every item is ticked and the
// cook hits the ticket's action button, it's Served immediately and moves to Completed here.
const PENDING_STATUSES: OrderStatus[] = ["Wait List", "In Kitchen"];
const COMPLETED_STATUSES: OrderStatus[] = ["Ready", "Served", "Voided"];

export function KitchenClient({
  orders,
  categories,
  dishes,
  printers,
  timerLimitMinutes,
  openTime,
}: {
  orders: Order[];
  categories: Category[];
  dishes: Dish[];
  printers: Printer[];
  timerLimitMinutes: number;
  openTime: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [now, setNow] = useState(() => Date.now());
  const [fontScaleIndex, setFontScaleIndex] = useState(DEFAULT_FONT_SCALE_INDEX);
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [station, setStation] = useState<PrinterStation | "All">("All");

  // Which stations this restaurant actually uses — either a printer assigned to that station, or
  // a category explicitly pinned to it via kitchenDisplayStation (so a display-only station with
  // no printer still gets a tab). A restaurant with just one station never sees a selector at
  // all, since there's nothing to route between yet.
  const availableStations = useMemo(() => {
    const pinned = new Set(categories.map((c) => c.kitchenDisplayStation).filter((s): s is PrinterStation => !!s && s !== "None"));
    return STATION_ORDER.filter((s) => printers.some((p) => p.station === s) || pinned.has(s));
  }, [printers, categories]);

  const dishesById = useMemo(() => new Map(dishes.map((d) => [d.id, d])), [dishes]);
  const categoriesById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const printersById = useMemo(() => new Map(printers.map((p) => [p.id, p])), [printers]);
  // `categories` comes back in the same order Manage Dishes lists them in — reusing that order
  // (rather than each ticket's own add-order) lets prep follow one consistent sequence per station.
  const categoryOrderIndex = useMemo(() => new Map(categories.map((c, idx) => [c.id, idx])), [categories]);

  function itemSortIndex(item: OrderItem): number {
    const dish = dishesById.get(item.dishId);
    if (!dish) return Number.MAX_SAFE_INTEGER;
    return categoryOrderIndex.get(dish.categoryId) ?? Number.MAX_SAFE_INTEGER;
  }

  // Resolves which Kitchen Display station an item shows up on. A category's own
  // kitchenDisplayStation (set in Manage Dishes) wins when set — "None" hides it everywhere,
  // any station pins it there regardless of printer. Left unset (the default for every category
  // today), it falls back to the old behavior: per-dish printer, falling back to the category's
  // printer, same precedence as everywhere else this pairing is used (Till, Manage Dishes). A
  // custom/unlisted item, or one with no printer either way, resolves to null and is treated as
  // unrouted — shown on every station, never hidden.
  function resolveItemDisplayStation(item: OrderItem): PrinterStation | "None" | null {
    const dish = dishesById.get(item.dishId);
    const category = dish ? categoriesById.get(dish.categoryId) : undefined;
    if (category?.kitchenDisplayStation) return category.kitchenDisplayStation as PrinterStation | "None";
    const printerId = dish?.printerId ?? category?.printerId;
    if (!printerId) return null;
    return printersById.get(printerId)?.station ?? null;
  }

  // Whether an item needs Kitchen Display tracking at all — false only for an explicit "None"
  // override. Used to keep a no-display item from blocking a ticket's "every item ready" gate,
  // since it never gets a checkbox to tick on any station's screen.
  function itemHasDisplay(item: OrderItem) {
    return resolveItemDisplayStation(item) !== "None";
  }

  function itemMatchesStation(item: OrderItem) {
    const display = resolveItemDisplayStation(item);
    if (display === "None") return false;
    if (station === "All") return true;
    return display === null || display === station;
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

  // Most browsers block audio until the page has seen a user gesture — the first tap anywhere
  // on this screen (ticking an item, switching stations, etc.) unlocks it for the whole session.
  useEffect(() => {
    const unlock = () => unlockOrderAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  // Chimes off the order data itself (not the button clicks that cause it), so a ticket that
  // arrives or finishes from another device — the Till, an online order — still gets announced
  // here. `null` on the first run means "just loaded", which shouldn't chime for existing tickets.
  const prevStatusesRef = useRef<Map<string, OrderStatus> | null>(null);
  useEffect(() => {
    const previous = prevStatusesRef.current;
    const next = new Map(orders.map((o) => [o.id, o.status] as const));
    if (previous) {
      let hasNewOrder = false;
      let hasNewlyReady = false;
      for (const [id, status] of next) {
        const prevStatus = previous.get(id);
        if (prevStatus === undefined) {
          if (PENDING_STATUSES.includes(status)) hasNewOrder = true;
        } else if (prevStatus !== "Ready" && status === "Ready") {
          hasNewlyReady = true;
        }
      }
      if (hasNewOrder) playNewOrderChime();
      if (hasNewlyReady) playOrderReadyChime();
    }
    prevStatusesRef.current = next;
  }, [orders]);

  function advance(orderId: string, status: OrderStatus) {
    startTransition(async () => {
      await setOrderStatusAction(orderId, status);
      router.refresh();
    });
  }

  function completeOrder(orderId: string) {
    startTransition(async () => {
      await completeOrderAction(orderId);
      router.refresh();
    });
  }

  function toggleItem(orderId: string, itemKey: string, ready: boolean) {
    startTransition(async () => {
      await toggleOrderItemReadyAction(orderId, itemKey, ready);
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

  // Already newest-first (listOrders sorts by createdAt desc), so the first pending ticket is
  // always the most recently placed one — that's the one flagged "major" below.
  let pendingOrders = orders.filter((o) => PENDING_STATUSES.includes(o.status));
  const todayStart = businessDayStart(now, openTime);
  let completedOrders = orders
    .filter((o) => COMPLETED_STATUSES.includes(o.status) && doneAt(o) >= todayStart)
    .sort((a, b) => doneAt(b) - doneAt(a));
  // A ticket only belongs on this station's screen if it has at least one item that routes here
  // (or is unrouted) — an all-drinks order never shows up on the Kitchen screen. Applied even on
  // "All", since that's also where a category explicitly set to "no display" needs to disappear.
  pendingOrders = pendingOrders.filter((o) => o.items.some(itemMatchesStation));
  completedOrders = completedOrders.filter((o) => o.items.some(itemMatchesStation));

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
          <button
            onClick={() => window.location.reload()}
            title="Refresh — reloads the page and clears any cached data"
            className="flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-sm font-semibold text-neutral-500 hover:bg-neutral-50"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
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

      <div className="flex flex-1 gap-4 overflow-hidden">
        <div className="flex min-h-0 flex-[3] flex-col rounded-2xl bg-white">
          <div className="flex items-center justify-between rounded-t-2xl border-t-4 border-t-amber-400 px-4 py-3">
            <span className="text-base font-bold text-neutral-900">Pending</span>
            <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-neutral-100 px-2 text-sm font-bold text-neutral-600">
              {pendingOrders.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {pendingOrders.length === 0 && (
              <div className="flex h-24 items-center justify-center text-sm text-neutral-300">No orders</div>
            )}
            {/* Dense, uniform grid (no outlier-sized card) — the goal is fitting at least 8 full
                tickets on screen at once with large, legible text, not decoration. See
                OrderTicket for the matching low-chrome layout. */}
            <div className="grid grid-cols-2 items-start gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {pendingOrders.map((order, idx) => (
                <OrderTicket
                  key={order.id}
                  order={order}
                  now={now}
                  timerLimitMinutes={timerLimitMinutes}
                  station={station}
                  itemMatchesStation={itemMatchesStation}
                  itemHasDisplay={itemHasDisplay}
                  itemSortIndex={itemSortIndex}
                  major={idx === 0}
                  onAdvance={(status) => advance(order.id, status)}
                  onToggleItem={(itemKey, ready) => toggleItem(order.id, itemKey, ready)}
                  onComplete={() => completeOrder(order.id)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex min-h-0 w-full max-w-xs flex-col rounded-2xl bg-white">
          <div className="flex items-center justify-between rounded-t-2xl border-t-4 border-t-neutral-300 px-4 py-3">
            <span className="text-base font-bold text-neutral-900">Completed</span>
            <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-neutral-100 px-2 text-sm font-bold text-neutral-600">
              {completedOrders.length}
            </span>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {completedOrders.length === 0 && (
              <div className="flex h-24 items-center justify-center text-sm text-neutral-300">No orders</div>
            )}
            {completedOrders.map((order) => (
              <CompletedOrderRow key={order.id} order={order} itemMatchesStation={station !== "All" ? itemMatchesStation : undefined} />
            ))}
          </div>
        </div>
      </div>

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

// The whole ticket's background/border, not just the elapsed-time badge — so a cook reads
// urgency from across the room without finding and focusing on the small timer text. Gets more
// saturated band by band (green barely tints the card; red fills it and pulses) so the card
// visibly "fills up" as it nears and then blows past the admin's kitchen timer limit.
const TICKET_BAND_STYLES = {
  green: "border-neutral-200",
  yellow: "border-yellow-300 bg-yellow-50",
  orange: "border-orange-400 bg-orange-100",
  red: "border-rose-500 bg-rose-200 animate-pulse",
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

// A read-only rundown for the Completed column — order number, time, table/channel, customer
// info, items with their customization notes, void reason — everything OrderTicket shows on an
// active ticket except the ready-checkboxes and advance buttons, which no longer apply once it's
// done. Not the full interactive OrderTicket card itself, so a busy day's worth of finished
// tickets stays scannable in a narrow, scrolling column instead of turning into a wall of
// oversized, mostly-disabled cards.
function CompletedOrderRow({
  order,
  itemMatchesStation,
}: {
  order: Order;
  itemMatchesStation?: (item: OrderItem) => boolean;
}) {
  const visibleItems = itemMatchesStation ? order.items.filter(itemMatchesStation) : order.items;
  const isVoided = order.status === "Voided";
  const tint = isVoided ? "border-rose-200 bg-rose-50" : order.status === "Ready" ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50";
  const hasCustomerInfo = order.customerName || order.customerPhone || order.customerAddress;

  return (
    <div className={`rounded-xl border px-3 py-2.5 text-base ${tint}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-lg font-extrabold text-neutral-900">#{order.orderNumber}</span>
        <span className="text-sm text-neutral-500">{formatOrderTimestamp(order.createdAt)}</span>
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1 text-sm font-bold text-neutral-500">
        <span>
          {order.tableNumber
            ? `Table ${String(order.tableNumber).padStart(2, "0")}${
                order.mergedTableNumbers?.length ? ` + ${order.mergedTableNumbers.join(" + ")}` : ""
              }`
            : order.channel}
          {order.thirdPartyProvider ? ` · ${order.thirdPartyProvider}` : ""}
        </span>
        {order.placedVia !== "staff" && (
          <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-bold text-indigo-700">
            {order.placedVia === "kiosk" ? "KIOSK" : "ONLINE"}
          </span>
        )}
      </div>
      {isVoided && (
        <div className="mt-1 text-sm font-semibold text-rose-600">Voided{order.voidReason ? ` — ${order.voidReason}` : ""}</div>
      )}
      {order.status === "Ready" && <div className="mt-1 text-sm font-semibold text-amber-600">Ready for pickup</div>}
      {hasCustomerInfo && (
        <div className="mt-1 space-y-0.5 rounded-lg bg-white/60 px-2 py-1.5 text-sm text-neutral-600">
          {order.customerName && <div className="font-semibold text-neutral-800">{order.customerName}</div>}
          {order.customerPhone && <div>{order.customerPhone}</div>}
          {order.customerAddress && <div>{order.customerAddress}</div>}
        </div>
      )}
      <div className="mt-1 space-y-1 text-sm text-neutral-600">
        {visibleItems.map((item, idx) => (
          <div key={item.lineId ?? `${item.dishId}-${idx}`}>
            <span className={isVoided ? "line-through decoration-rose-300" : undefined}>
              {item.qty}x {item.name}
            </span>
            {item.note && <div className="font-semibold italic text-amber-600">↳ {item.note}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function OrderTicket({
  order,
  now,
  timerLimitMinutes,
  station,
  itemMatchesStation,
  itemHasDisplay,
  itemSortIndex,
  major,
  onAdvance,
  onToggleItem,
  onComplete,
}: {
  order: Order;
  now: number | null;
  timerLimitMinutes: number;
  station: PrinterStation | "All";
  itemMatchesStation: (item: OrderItem) => boolean;
  itemHasDisplay: (item: OrderItem) => boolean;
  itemSortIndex: (item: OrderItem) => number;
  major: boolean;
  onAdvance: (status: OrderStatus) => void;
  onToggleItem: (itemKey: string, ready: boolean) => void;
  onComplete: () => void;
}) {
  const elapsedMs = now !== null ? now - order.createdAt : null;
  const band = elapsedMs !== null ? timerBand(elapsedMs, timerLimitMinutes) : null;
  const itemsCheckable = order.status === "In Kitchen";
  // A "no display" item never gets a checkbox anywhere, so it can't block the "every item
  // ready" gate — it's treated as automatically satisfied.
  const allItemsReady = order.items.every((i) => !itemHasDisplay(i) || i.ready);
  const isVoided = order.status === "Voided";
  const isDone = order.status === "Served";
  // Flags a ticket that got new items added after it was already sent (including one the
  // kitchen had already finished — see the reopensKitchen check in placeOrderAction) — cleared
  // once it's done (Served/Voided), since it no longer matters.
  const wasUpdated = !!order.updatedAt && order.status !== "Served" && order.status !== "Voided";
  // On a single station's screen, only that station's items show — the rest of the ticket
  // belongs to another screen. A "no display" item is excluded even on "All" (itemMatchesStation
  // handles that). Whole-ticket actions (advance) stay in the "All" view only, since a bar screen
  // shouldn't be the one deciding a whole dine-in order is served. Voiding an order is a
  // Till-only action — this screen only ever displays the result, crossed out below.
  const visibleItems = order.items.filter(itemMatchesStation);
  const sortedItems = [...visibleItems].sort((a, b) => itemSortIndex(a) - itemSortIndex(b));
  const hiddenItemCount = order.items.length - visibleItems.length;
  const showTicketActions = station === "All";

  // Low-chrome by design: a KDS screen gets re-read dozens of times an hour under time pressure,
  // so every badge/icon/line of padding here is screen space one of the 8+ tickets on screen
  // doesn't get. Status is color + plain bold text, never an icon-and-pill combo.
  return (
    <div
      className={`rounded-lg border p-2 shadow-sm ${
        isVoided
          ? "border-rose-200 bg-rose-50/60 opacity-75"
          : isDone
            ? "border-emerald-200 bg-emerald-50/50"
            : band
              ? TICKET_BAND_STYLES[band]
              : "border-neutral-200"
      }`}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xl font-extrabold leading-none text-neutral-900">
          {isVoided && <XCircle className="h-5 w-5 shrink-0 text-rose-500" />}
          <span className={isVoided ? "line-through decoration-rose-400" : undefined}>#{order.orderNumber}</span>
          {major && <span className="rounded bg-amber-400 px-1.5 py-0.5 text-xs font-bold text-amber-950">NEW</span>}
        </span>
        {isVoided ? (
          <span className="text-sm font-bold text-rose-600">Voided</span>
        ) : isDone ? (
          <span className="text-sm font-bold text-emerald-600">Done</span>
        ) : elapsedMs !== null && band ? (
          <span className={`rounded-md px-1.5 py-0.5 text-sm font-bold ${TIMER_STYLES[band]}`}>{formatElapsed(elapsedMs)}</span>
        ) : (
          <span className="text-sm font-medium text-neutral-400">{formatOrderTimestamp(order.createdAt)}</span>
        )}
      </div>

      <div className="mb-1 flex flex-wrap items-baseline gap-1.5 text-base font-bold text-neutral-700">
        <span>
          {order.tableNumber
            ? `Table ${String(order.tableNumber).padStart(2, "0")}${
                order.mergedTableNumbers?.length ? ` + ${order.mergedTableNumbers.join(" + ")}` : ""
              }`
            : order.channel}
          {order.thirdPartyProvider ? ` · ${order.thirdPartyProvider}` : ""}
        </span>
        <span className="text-xs font-medium text-neutral-400">Seq {orderSequence(order.orderNumber)}</span>
      </div>

      {(isVoided || wasUpdated || order.channel === "Delivery" || order.channel === "Take Away" || order.placedVia !== "staff") && (
        <div className="mb-1 flex flex-wrap gap-1">
          {isVoided && (
            <span className="rounded bg-rose-100 px-1.5 py-0.5 text-xs font-bold text-rose-700">
              Cancelled{order.voidReason ? ` — ${order.voidReason}` : ""}
            </span>
          )}
          {wasUpdated && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-700">RUNNING — recheck items</span>}
          {order.channel === "Delivery" && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-bold text-blue-700">DELIVERY</span>}
          {order.channel === "Take Away" && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-700">TAKEAWAY</span>}
          {order.placedVia !== "staff" && (
            <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-bold text-indigo-700">
              {order.placedVia === "kiosk" ? "KIOSK" : "ONLINE"}
            </span>
          )}
        </div>
      )}

      {(order.customerName || order.customerPhone || order.customerAddress) && (
        <div className="mb-1 space-y-0.5 rounded-md bg-neutral-50 px-1.5 py-1 text-sm text-neutral-600">
          {order.customerName && <div className="font-bold text-neutral-800">{order.customerName}</div>}
          {order.customerPhone && (
            <div className="flex items-center gap-1">
              <Phone className="h-3 w-3 shrink-0" /> {order.customerPhone}
            </div>
          )}
          {order.customerAddress && (
            <div className="flex items-start gap-1">
              <MapPin className="h-3 w-3 shrink-0 translate-y-0.5" /> {order.customerAddress}
            </div>
          )}
        </div>
      )}

      <ul className="mb-1.5 space-y-0.5">
        {sortedItems.map((item, idx) => {
          const itemKey = item.lineId ?? `${item.dishId}-${idx}`;
          // A voided order's items are crossed out unconditionally (not just when ready) — the
          // whole ticket didn't happen, so every line on it should read that way at a glance.
          const crossedOut = isVoided || item.ready;
          return itemsCheckable ? (
            <li key={itemKey}>
              <button
                onClick={() => onToggleItem(item.lineId ?? item.dishId, !item.ready)}
                className="flex w-full items-center justify-between gap-2 rounded-md py-0.5 text-left text-lg leading-tight hover:bg-neutral-50"
              >
                <span className="min-w-0">
                  <span className={`font-extrabold ${item.ready ? "text-neutral-300" : "text-teal-600"}`}>{item.qty}× </span>
                  <span className={item.ready ? "text-neutral-400 line-through" : "font-semibold text-neutral-800"}>{item.name}</span>
                  {item.note && <div className="text-sm font-bold italic leading-tight text-amber-600">↳ {item.note}</div>}
                </span>
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 ${
                    item.ready ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-neutral-300"
                  }`}
                >
                  {item.ready && <Check className="h-4 w-4" strokeWidth={3} />}
                </span>
              </button>
            </li>
          ) : (
            <li key={itemKey} className="text-lg leading-tight">
              <span className={`font-extrabold ${isVoided ? "text-rose-400" : "text-teal-600"}`}>{item.qty}× </span>
              <span
                className={
                  isVoided
                    ? "text-rose-400 line-through decoration-rose-400"
                    : crossedOut
                      ? "text-neutral-400 line-through"
                      : "font-semibold text-neutral-800"
                }
              >
                {item.name}
              </span>
              {item.note && <div className="ml-4 text-sm font-bold italic leading-tight text-amber-600">↳ {item.note}</div>}
            </li>
          );
        })}
      </ul>
      {hiddenItemCount > 0 && (
        <div className="mb-1.5 text-xs italic text-neutral-400">
          +{hiddenItemCount} more item{hiddenItemCount === 1 ? "" : "s"} not shown here
        </div>
      )}
      {!isVoided && !isDone && showTicketActions && (
        <div className="flex gap-1.5">
          {order.status === "In Kitchen" && (
            <button
              onClick={() => onAdvance("Served")}
              disabled={!allItemsReady}
              title={allItemsReady ? undefined : "Tick off every item first"}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--brand)] py-2.5 text-base font-bold text-white active:scale-95 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400"
            >
              <CheckCircle2 className="h-5 w-5" /> Served
            </button>
          )}
          {order.status === "Wait List" && (
            <button
              onClick={() => onAdvance("In Kitchen")}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber-500 py-2.5 text-base font-bold text-white active:scale-95"
            >
              Send to Kitchen
            </button>
          )}
          <button
            onClick={onComplete}
            title="Marks every item on this ticket ready and completes the order in one tap"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2.5 text-base font-bold text-white active:scale-95"
          >
            <CheckCheck className="h-5 w-5" /> Complete
          </button>
        </div>
      )}
    </div>
  );
}

