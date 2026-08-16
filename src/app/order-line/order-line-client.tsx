"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CategoryIconView } from "@/components/category-icon";
import type { Category, Dish, Order, OrderChannel, OrderItem, OrderStatus, RestaurantTable } from "@/lib/types";
import { placeOrderAction, setOrderStatusAction } from "@/lib/actions/orders";
import {
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  Pencil,
  Trash2,
  Wallet,
  CreditCard,
  ScanLine,
  LayoutGrid,
  X,
} from "lucide-react";

const QUEUE_TABS = ["All", "Dine in", "Wait List", "Take Away", "Served"] as const;
type QueueTab = (typeof QUEUE_TABS)[number];

const STATUS_STYLES: Record<Order["status"], string> = {
  "In Kitchen": "bg-teal-100 text-teal-700",
  "Wait List": "bg-orange-100 text-orange-700",
  Ready: "bg-purple-100 text-purple-700",
  Served: "bg-neutral-100 text-neutral-600",
};

const CARD_TINTS: Record<Order["status"], string> = {
  "In Kitchen": "bg-teal-50 border-teal-100",
  "Wait List": "bg-orange-50 border-orange-100",
  Ready: "bg-purple-50 border-purple-100",
  Served: "bg-neutral-50 border-neutral-100",
};

const TAX_RATE = 0.06;

interface CartState {
  editingOrderId: string | null;
  tableId: string | null;
  tableNumber: number | null;
  guests: number;
  channel: OrderChannel;
  items: OrderItem[];
}

const emptyCart: CartState = {
  editingOrderId: null,
  tableId: null,
  tableNumber: null,
  guests: 2,
  channel: "Dine in",
  items: [],
};

export function OrderLineClient({
  categories,
  dishes,
  tables,
  orders,
}: {
  categories: Category[];
  dishes: Dish[];
  tables: RestaurantTable[];
  orders: Order[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [cart, setCart] = useState<CartState>(() => {
    const tableId = searchParams.get("tableId");
    const tableNumber = searchParams.get("tableNumber");
    if (tableId && tableNumber) {
      return { ...emptyCart, tableId, tableNumber: Number(tableNumber), guests: 1 };
    }
    return emptyCart;
  });

  const [queueTab, setQueueTab] = useState<QueueTab>("All");
  const [menuCategory, setMenuCategory] = useState<string>("all");
  const [paymentMethod, setPaymentMethod] = useState<"Cash" | "Card" | "Scan">("Card");
  const [donation, setDonation] = useState(true);
  const [tableEditorOpen, setTableEditorOpen] = useState(false);

  const queueRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (queueTab === "All") return true;
      if (queueTab === "Dine in") return o.channel === "Dine in";
      if (queueTab === "Wait List") return o.status === "Wait List";
      if (queueTab === "Take Away") return o.channel === "Take Away";
      if (queueTab === "Served") return o.status === "Served";
      return true;
    });
  }, [orders, queueTab]);

  const queueCounts = useMemo(() => {
    return {
      All: orders.length,
      "Dine in": orders.filter((o) => o.channel === "Dine in").length,
      "Wait List": orders.filter((o) => o.status === "Wait List").length,
      "Take Away": orders.filter((o) => o.channel === "Take Away").length,
      Served: orders.filter((o) => o.status === "Served").length,
    } satisfies Record<QueueTab, number>;
  }, [orders]);

  const menuDishes = useMemo(() => {
    if (menuCategory === "all") return dishes;
    return dishes.filter((d) => d.categoryId === menuCategory);
  }, [dishes, menuCategory]);

  const qtyFor = (dishId: string) => cart.items.find((i) => i.dishId === dishId)?.qty ?? 0;

  const subtotal = cart.items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const tax = subtotal * TAX_RATE;
  const donationAmount = donation && cart.items.length > 0 ? 1 : 0;
  const total = subtotal + tax + donationAmount;

  const availableTables = tables.filter((t) => t.status !== "on-dine" || t.id === cart.tableId);
  const editingOrder = cart.editingOrderId ? orders.find((o) => o.id === cart.editingOrderId) : null;

  function scroll(ref: React.RefObject<HTMLDivElement | null>, dir: 1 | -1) {
    ref.current?.scrollBy({ left: dir * 260, behavior: "smooth" });
  }

  function addToCart(dish: Dish) {
    setCart((prev) => {
      const existing = prev.items.find((i) => i.dishId === dish.id);
      if (existing) {
        return { ...prev, items: prev.items.map((i) => (i.dishId === dish.id ? { ...i, qty: i.qty + 1 } : i)) };
      }
      return { ...prev, items: [...prev.items, { dishId: dish.id, name: dish.name, price: dish.price, qty: 1 }] };
    });
  }

  function decrementCartItem(dishId: string) {
    setCart((prev) => ({
      ...prev,
      items: prev.items.map((i) => (i.dishId === dishId ? { ...i, qty: i.qty - 1 } : i)).filter((i) => i.qty > 0),
    }));
  }

  function removeCartItem(dishId: string) {
    setCart((prev) => ({ ...prev, items: prev.items.filter((i) => i.dishId !== dishId) }));
  }

  function loadOrderIntoCart(order: Order) {
    setCart({
      editingOrderId: order.id,
      tableId: order.tableId,
      tableNumber: order.tableNumber,
      guests: order.guests,
      channel: order.channel,
      items: order.items,
    });
    setDonation((order.donation ?? 0) > 0);
    if (order.paymentMethod) setPaymentMethod(order.paymentMethod);
  }

  function handlePlaceOrder() {
    if (cart.items.length === 0) return;
    startTransition(async () => {
      await placeOrderAction({
        editingOrderId: cart.editingOrderId,
        tableId: cart.tableId,
        tableNumber: cart.tableNumber,
        guests: cart.guests,
        channel: cart.channel,
        items: cart.items,
        paymentMethod,
        donation: donationAmount,
      });
      setCart(emptyCart);
      setDonation(true);
      router.refresh();
    });
  }

  function handleAdvanceStatus(next: OrderStatus) {
    if (!cart.editingOrderId) return;
    startTransition(async () => {
      await setOrderStatusAction(cart.editingOrderId!, next);
      router.refresh();
    });
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Main column */}
      <div className="flex-1 overflow-y-auto p-6">
        <h1 className="mb-4 text-xl font-semibold text-neutral-900">Order Line</h1>

        {/* Queue tabs */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {QUEUE_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setQueueTab(tab)}
              className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                queueTab === tab
                  ? "border-teal-600 bg-teal-600 text-white"
                  : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              {tab}
              <span
                className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold ${
                  queueTab === tab ? "bg-white/20 text-white" : "bg-neutral-100 text-neutral-500"
                }`}
              >
                {queueCounts[tab]}
              </span>
            </button>
          ))}
        </div>

        {/* Order queue row */}
        <div className="relative mb-8">
          <div ref={queueRef} className="flex gap-4 overflow-x-auto pb-1 scroll-smooth">
            {filteredOrders.length === 0 && (
              <div className="flex h-24 flex-1 items-center justify-center text-sm text-neutral-400">
                No orders in this view.
              </div>
            )}
            {filteredOrders.map((order) => (
              <button
                key={order.id}
                onClick={() => loadOrderIntoCart(order)}
                className={`flex w-56 shrink-0 flex-col gap-2 rounded-2xl border p-4 text-left transition-shadow hover:shadow-md ${
                  CARD_TINTS[order.status]
                } ${cart.editingOrderId === order.id ? "ring-2 ring-teal-500" : ""}`}
              >
                <div className="flex items-center justify-between text-sm font-semibold text-neutral-800">
                  <span>Order #{order.orderNumber}</span>
                  <span className="text-neutral-500">{order.tableNumber ? `Table ${String(order.tableNumber).padStart(2, "0")}` : "Take Away"}</span>
                </div>
                <div className="text-sm text-neutral-500">
                  Item: {order.items.reduce((s, i) => s + i.qty, 0)}X
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-400">{order.createdLabel}</span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[order.status]}`}>
                    {order.status}
                  </span>
                </div>
              </button>
            ))}
          </div>
          {filteredOrders.length > 3 && (
            <button
              onClick={() => scroll(queueRef, 1)}
              className="absolute -right-3 top-1/2 hidden -translate-y-1/2 rounded-full border border-neutral-200 bg-white p-1.5 shadow-md lg:flex"
            >
              <ChevronRight className="h-4 w-4 text-neutral-500" />
            </button>
          )}
        </div>

        {/* Menu categories */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Foodies Menu</h2>
          <div className="hidden items-center gap-1.5 sm:flex">
            <button onClick={() => scroll(menuRef, -1)} className="rounded-full border border-neutral-200 p-1.5 hover:bg-neutral-50">
              <ChevronLeft className="h-4 w-4 text-neutral-500" />
            </button>
            <button onClick={() => scroll(menuRef, 1)} className="rounded-full border border-neutral-200 p-1.5 hover:bg-neutral-50">
              <ChevronRight className="h-4 w-4 text-neutral-500" />
            </button>
          </div>
        </div>
        <div ref={menuRef} className="mb-6 flex gap-3 overflow-x-auto pb-1 scroll-smooth">
          <MenuTab
            active={menuCategory === "all"}
            icon="all"
            label="All Menu"
            count={dishes.length}
            onClick={() => setMenuCategory("all")}
          />
          {categories.map((c) => (
            <MenuTab
              key={c.id}
              active={menuCategory === c.id}
              icon={c.icon}
              label={c.name}
              count={dishes.filter((d) => d.categoryId === c.id).length}
              onClick={() => setMenuCategory(c.id)}
            />
          ))}
        </div>

        {/* Dish grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          {menuDishes.map((dish) => {
            const qty = qtyFor(dish.id);
            return (
              <div
                key={dish.id}
                className={`flex flex-col rounded-2xl border bg-white p-4 transition-shadow hover:shadow-md ${
                  qty > 0 ? "border-teal-400 ring-1 ring-teal-100" : "border-neutral-200"
                }`}
              >
                <div
                  className="mb-3 flex h-14 w-14 items-center justify-center rounded-full text-2xl"
                  style={{ backgroundColor: dish.color }}
                >
                  {dish.emoji}
                </div>
                <div className="text-xs text-neutral-400">
                  {categories.find((c) => c.id === dish.categoryId)?.name}
                </div>
                <div className="mb-2 line-clamp-1 font-semibold text-neutral-900">{dish.name}</div>
                <div className="mt-auto flex items-center justify-between">
                  <span className="font-semibold text-neutral-800">${dish.price.toFixed(2)}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => decrementCartItem(dish.id)}
                      disabled={qty === 0}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-neutral-200 text-neutral-500 hover:bg-neutral-50 disabled:opacity-30"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-4 text-center text-sm font-semibold text-neutral-800">{qty}</span>
                    <button
                      onClick={() => addToCart(dish)}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-600 text-white hover:bg-teal-700"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {menuDishes.length === 0 && (
            <div className="col-span-full py-16 text-center text-sm text-neutral-400">No dishes in this category.</div>
          )}
        </div>
      </div>

      {/* Cart / order panel */}
      <div className="hidden w-[400px] shrink-0 flex-col border-l border-neutral-200 bg-white p-5 lg:flex overflow-y-auto">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">
              {cart.tableNumber ? `Table No #${String(cart.tableNumber).padStart(2, "0")}` : "Take Away Order"}
            </h2>
            <p className="mt-0.5 text-sm text-neutral-400">
              {cart.editingOrderId ? `Order #${editingOrder?.orderNumber}` : "New Order"}
              {" · "}
              {cart.guests} {cart.guests === 1 ? "Person" : "People"}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setTableEditorOpen((v) => !v)}
              className="rounded-lg border border-neutral-200 p-1.5 text-neutral-400 hover:bg-neutral-50 hover:text-teal-600"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCart(emptyCart)}
              className="rounded-lg border border-neutral-200 p-1.5 text-neutral-400 hover:bg-rose-50 hover:text-rose-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {tableEditorOpen && (
          <div className="mb-4 space-y-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Table</label>
              <select
                value={cart.tableId ?? ""}
                onChange={(e) => {
                  const t = tables.find((tb) => tb.id === e.target.value);
                  setCart((prev) => ({ ...prev, tableId: t?.id ?? null, tableNumber: t?.number ?? null }));
                }}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-teal-500"
              >
                <option value="">Take Away / No Table</option>
                {availableTables.map((t) => (
                  <option key={t.id} value={t.id}>
                    Table {t.number} · {t.area} · seats {t.capacity}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Guests</label>
              <input
                type="number"
                min={1}
                value={cart.guests}
                onChange={(e) => setCart((prev) => ({ ...prev, guests: Math.max(1, Number(e.target.value)) }))}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-teal-500"
              />
            </div>
            <div className="flex gap-2">
              {(["Dine in", "Wait List", "Take Away"] as OrderChannel[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setCart((prev) => ({ ...prev, channel: c }))}
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium ${
                    cart.channel === c ? "border-teal-600 bg-teal-600 text-white" : "border-neutral-200 text-neutral-500"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-900">Ordered Items</h3>
          <span className="text-sm font-semibold text-neutral-400">
            {String(cart.items.reduce((s, i) => s + i.qty, 0)).padStart(2, "0")}
          </span>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto pr-1">
          {cart.items.length === 0 && (
            <div className="flex h-32 items-center justify-center text-center text-sm text-neutral-400">
              No items yet.
              <br />
              Tap a dish to add it to the order.
            </div>
          )}
          {cart.items.map((item) => (
            <div key={item.dishId} className="flex items-center justify-between gap-2 text-sm">
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 font-semibold text-teal-600">{item.qty}x</span>
                <span className="truncate text-neutral-700">{item.name}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="font-semibold text-neutral-800">${(item.price * item.qty).toFixed(2)}</span>
                <button onClick={() => removeCartItem(item.dishId)} className="text-neutral-300 hover:text-rose-500">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 space-y-2 border-t border-neutral-100 pt-4">
          <h3 className="mb-1 text-sm font-semibold text-neutral-900">Payment Summary</h3>
          <div className="flex justify-between text-sm text-neutral-500">
            <span>Subtotal</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm text-neutral-500">
            <span>Tax (6%)</span>
            <span>${tax.toFixed(2)}</span>
          </div>
          <label className="flex items-center justify-between text-sm text-neutral-500">
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={donation}
                onChange={(e) => setDonation(e.target.checked)}
                className="h-3.5 w-3.5 accent-teal-600"
              />
              Donation for Palestine
            </span>
            <span>${donationAmount.toFixed(2)}</span>
          </label>
          <div className="flex justify-between border-t border-neutral-100 pt-2 text-base font-semibold text-neutral-900">
            <span>Total Payable</span>
            <span>${total.toFixed(2)}</span>
          </div>
        </div>

        <div className="mt-4">
          <h3 className="mb-2 text-sm font-semibold text-neutral-900">Payment Method</h3>
          <div className="grid grid-cols-3 gap-2">
            <PaymentButton icon={Wallet} label="Cash" active={paymentMethod === "Cash"} onClick={() => setPaymentMethod("Cash")} />
            <PaymentButton icon={CreditCard} label="Card" active={paymentMethod === "Card"} onClick={() => setPaymentMethod("Card")} />
            <PaymentButton icon={ScanLine} label="Scan" active={paymentMethod === "Scan"} onClick={() => setPaymentMethod("Scan")} />
          </div>
        </div>

        {editingOrder && (
          <div className="mt-4 flex items-center justify-between rounded-xl bg-neutral-50 px-3 py-2 text-sm">
            <span className="text-neutral-500">Order Status</span>
            <StatusStepper status={editingOrder.status} onAdvance={handleAdvanceStatus} />
          </div>
        )}

        <button
          onClick={handlePlaceOrder}
          disabled={cart.items.length === 0}
          className="mt-4 w-full rounded-xl bg-teal-600 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {cart.editingOrderId ? "Update Order" : "Place Order"} · ${total.toFixed(2)}
        </button>
      </div>
    </div>
  );
}

function MenuTab({
  active,
  icon,
  label,
  count,
  onClick,
}: {
  active: boolean;
  icon: string;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 flex-col items-start gap-2 rounded-2xl border px-4 py-3 text-left transition-colors ${
        active ? "border-teal-600 bg-teal-50" : "border-neutral-200 bg-white hover:bg-neutral-50"
      }`}
    >
      <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${active ? "bg-teal-600 text-white" : "bg-neutral-100 text-neutral-500"}`}>
        {icon === "all" ? <LayoutGrid className="h-4 w-4" /> : <CategoryIconView icon={icon} className="h-4 w-4" />}
      </span>
      <span className="text-sm font-semibold text-neutral-800">{label}</span>
      <span className="text-xs text-neutral-400">{count} items</span>
    </button>
  );
}

function PaymentButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof Wallet;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 rounded-xl border py-2.5 text-xs font-medium transition-colors ${
        active ? "border-teal-600 bg-teal-50 text-teal-700" : "border-neutral-200 text-neutral-500 hover:bg-neutral-50"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

const STATUS_FLOW: Record<Order["status"], Order["status"] | null> = {
  "Wait List": "In Kitchen",
  "In Kitchen": "Ready",
  Ready: "Served",
  Served: null,
};

const STATUS_ACTION_LABEL: Record<Order["status"], string> = {
  "Wait List": "Send to Kitchen",
  "In Kitchen": "Mark Ready",
  Ready: "Mark Served",
  Served: "Done",
};

function StatusStepper({ status, onAdvance }: { status: Order["status"]; onAdvance: (next: Order["status"]) => void }) {
  const next = STATUS_FLOW[status];
  return (
    <button
      disabled={!next}
      onClick={() => next && onAdvance(next)}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
        next ? "bg-teal-600 text-white hover:bg-teal-700" : "bg-neutral-200 text-neutral-500"
      }`}
    >
      {STATUS_ACTION_LABEL[status]}
    </button>
  );
}
