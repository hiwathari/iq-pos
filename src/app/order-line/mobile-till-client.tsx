"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { placeOrderAction } from "@/lib/actions/orders";
import { formatMoney } from "@/lib/types";
import type { Category, Dish, Order, OrderChannel, OrderItem, RestaurantTable, ThirdPartyProvider } from "@/lib/types";
import {
  ArrowLeft,
  Ban,
  Bike,
  ChevronRight,
  Globe,
  Minus,
  Plus,
  ShoppingBag,
  ShoppingCart,
  Store,
  Users,
  UtensilsCrossed,
} from "lucide-react";

const TAX_RATE = 0.06;
const TABLE_AREAS = ["Ground Floor", "1st Floor", "Basement"] as const;

type Screen = "channel" | "third-party" | "table" | "menu" | "cart";

interface SimpleCart {
  editingOrderId: string | null;
  tableId: string | null;
  tableNumber: number | null;
  guests: number;
  channel: OrderChannel;
  thirdPartyProvider: ThirdPartyProvider;
  items: OrderItem[];
  customerName: string;
  customerPhone: string;
}

const emptyCart: SimpleCart = {
  editingOrderId: null,
  tableId: null,
  tableNumber: null,
  guests: 2,
  channel: "Dine in",
  thirdPartyProvider: "Uber Eats",
  items: [],
  customerName: "",
  customerPhone: "",
};

// Matches the Till's own definition — a paid-and-served order is done, so tapping its table
// starts a fresh one instead of loading a closed ticket back up.
function isOrderClosedOut(o: Order) {
  return o.status === "Served" && !!o.paymentMethod;
}

const CHANNELS: { channel: OrderChannel; label: string; icon: typeof UtensilsCrossed }[] = [
  { channel: "Dine in", label: "Dine In", icon: UtensilsCrossed },
  { channel: "Take Away", label: "Take Away", icon: ShoppingBag },
  { channel: "Wait List", label: "Wait List", icon: Users },
  { channel: "Delivery", label: "Delivery", icon: Bike },
  { channel: "Online", label: "Online", icon: Globe },
  { channel: "Third Party", label: "Third Party", icon: Store },
];

export function MobileTillClient({
  categories,
  dishes,
  tables,
  orders,
  currencySymbol,
  restaurantName,
  onSwitchToFull,
}: {
  categories: Category[];
  dishes: Dish[];
  tables: RestaurantTable[];
  orders: Order[];
  currencySymbol: string;
  restaurantName: string;
  onSwitchToFull: () => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [screen, setScreen] = useState<Screen>("channel");
  const [cart, setCart] = useState<SimpleCart>(emptyCart);
  const [tablesArea, setTablesArea] = useState<(typeof TABLE_AREAS)[number]>("Ground Floor");
  const [menuCategory, setMenuCategory] = useState("all");
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const menuDishes = useMemo(
    () => dishes.filter((d) => menuCategory === "all" || d.categoryId === menuCategory),
    [dishes, menuCategory]
  );
  const areaTables = useMemo(() => tables.filter((t) => t.area === tablesArea), [tables, tablesArea]);

  const priceFor = (dish: Dish) => {
    const key = cart.channel === "Third Party" ? cart.thirdPartyProvider : cart.channel;
    return dish.channelPrices?.[key] ?? dish.price;
  };
  const qtyFor = (dishId: string) => cart.items.find((i) => i.dishId === dishId)?.qty ?? 0;
  const subtotal = cart.items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const total = subtotal * (1 + TAX_RATE);
  const itemCount = cart.items.reduce((sum, i) => sum + i.qty, 0);

  function selectChannel(channel: OrderChannel) {
    if (channel === "Third Party") {
      setCart((c) => ({ ...c, channel }));
      setScreen("third-party");
      return;
    }
    setCart((c) => ({ ...c, channel, tableId: null, tableNumber: null }));
    setScreen(channel === "Dine in" ? "table" : "menu");
  }

  function selectThirdParty(provider: ThirdPartyProvider) {
    setCart((c) => ({ ...c, thirdPartyProvider: provider }));
    setScreen("menu");
  }

  function selectTable(table: RestaurantTable) {
    const activeOrder = orders.find(
      (o) => o.tableId === table.id && o.status !== "Voided" && !isOrderClosedOut(o)
    );
    if (activeOrder) {
      setCart({
        editingOrderId: activeOrder.id,
        tableId: table.id,
        tableNumber: table.number,
        guests: activeOrder.guests,
        channel: "Dine in",
        thirdPartyProvider: "Uber Eats",
        items: activeOrder.items.map((i) => ({ ...i })),
        customerName: "",
        customerPhone: "",
      });
    } else {
      setCart((c) => ({ ...emptyCart, channel: "Dine in", tableId: table.id, tableNumber: table.number, guests: c.guests }));
    }
    setMenuCategory("all");
    setScreen("menu");
  }

  function addToCart(dish: Dish) {
    if (dish.outOfStock) return;
    setCart((prev) => {
      const existing = prev.items.find((i) => i.dishId === dish.id);
      if (existing) {
        return { ...prev, items: prev.items.map((i) => (i.dishId === dish.id ? { ...i, qty: i.qty + 1 } : i)) };
      }
      return { ...prev, items: [...prev.items, { dishId: dish.id, name: dish.name, price: priceFor(dish), qty: 1 }] };
    });
  }

  function decrementCartItem(dishId: string) {
    setCart((prev) => ({
      ...prev,
      items: prev.items.map((i) => (i.dishId === dishId ? { ...i, qty: i.qty - 1 } : i)).filter((i) => i.qty > 0),
    }));
  }

  function adjustGuests(delta: 1 | -1) {
    setCart((prev) => ({ ...prev, guests: Math.max(1, prev.guests + delta) }));
  }

  function backFromMenu() {
    setScreen(cart.channel === "Dine in" ? "table" : "channel");
  }

  function startOver() {
    setCart(emptyCart);
    setMenuCategory("all");
    setScreen("channel");
  }

  function send() {
    if (cart.items.length === 0 || sending) return;
    setSending(true);
    startTransition(async () => {
      await placeOrderAction({
        editingOrderId: cart.editingOrderId,
        tableId: cart.tableId,
        tableNumber: cart.tableNumber,
        guests: cart.guests,
        channel: cart.channel,
        thirdPartyProvider: cart.channel === "Third Party" ? cart.thirdPartyProvider : undefined,
        items: cart.items,
        payments: [],
        customerName: cart.customerName.trim() || undefined,
        customerPhone: cart.customerPhone.trim() || undefined,
      });
      router.refresh();
      setToast(cart.tableNumber ? `Sent to Table ${cart.tableNumber}` : `Sent — ${cart.channel}`);
      setSending(false);
      setCart(emptyCart);
      setMenuCategory("all");
      setScreen("channel");
      setTimeout(() => setToast(null), 3500);
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-50">
      {toast && (
        <div className="absolute left-1/2 top-3 z-50 -translate-x-1/2 rounded-full bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      )}

      {screen === "channel" && (
        <div className="flex flex-1 flex-col p-4">
          <div className="mb-1 flex items-center justify-between">
            <h1 className="text-lg font-bold text-neutral-900">{restaurantName}</h1>
            <button onClick={onSwitchToFull} className="text-xs font-medium text-neutral-400 underline underline-offset-2">
              Full Till
            </button>
          </div>
          <p className="mb-5 text-sm text-neutral-400">What kind of order is this?</p>
          <div className="grid grid-cols-2 gap-3">
            {CHANNELS.map(({ channel, label, icon: Icon }) => (
              <button
                key={channel}
                onClick={() => selectChannel(channel)}
                className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-neutral-200 bg-white py-8 shadow-sm active:scale-95"
              >
                <Icon className="h-7 w-7 text-teal-600" />
                <span className="text-base font-semibold text-neutral-800">{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {screen === "third-party" && (
        <div className="flex flex-1 flex-col p-4">
          <BackHeader label="Third-Party Provider" onBack={() => setScreen("channel")} />
          <div className="mt-4 flex flex-col gap-3">
            {(["Uber Eats", "Deliveroo", "Just Eat", "Other"] as ThirdPartyProvider[]).map((p) => (
              <button
                key={p}
                onClick={() => selectThirdParty(p)}
                className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white px-5 py-5 text-left text-base font-semibold text-neutral-800 shadow-sm active:scale-95"
              >
                {p} <ChevronRight className="h-5 w-5 text-neutral-300" />
              </button>
            ))}
          </div>
        </div>
      )}

      {screen === "table" && (
        <div className="flex flex-1 flex-col p-4">
          <BackHeader label="Pick a Table" onBack={() => setScreen("channel")} />
          <div className="mb-4 mt-3 flex gap-2 overflow-x-auto">
            {TABLE_AREAS.map((a) => (
              <button
                key={a}
                onClick={() => setTablesArea(a)}
                className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${
                  tablesArea === a ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-neutral-200 bg-white text-neutral-600"
                }`}
              >
                {a}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3 overflow-y-auto pb-4">
            {areaTables.map((table) => {
              const hasLiveOrder = orders.some(
                (o) => o.tableId === table.id && o.status !== "Voided" && !isOrderClosedOut(o)
              );
              return (
                <button
                  key={table.id}
                  onClick={() => selectTable(table)}
                  className={`flex flex-col items-center justify-center gap-1 rounded-2xl border-2 py-5 active:scale-95 ${
                    table.status === "on-dine"
                      ? "border-teal-400 bg-teal-50"
                      : table.status === "reserved"
                        ? "border-amber-300 bg-amber-50"
                        : "border-neutral-200 bg-white"
                  }`}
                >
                  <span className="text-base font-bold text-neutral-800">#{table.number}</span>
                  <span className="text-[11px] text-neutral-400">{table.capacity} seats</span>
                  {hasLiveOrder && <span className="text-[10px] font-semibold text-teal-700">Add items</span>}
                </button>
              );
            })}
            {areaTables.length === 0 && (
              <div className="col-span-3 py-10 text-center text-sm text-neutral-400">No tables in this area.</div>
            )}
          </div>
        </div>
      )}

      {screen === "menu" && (
        <div className="flex flex-1 min-h-0 flex-col">
          <div className="border-b border-neutral-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <button onClick={backFromMenu} className="flex items-center gap-1 text-sm font-medium text-neutral-500">
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <span className="text-sm font-semibold text-neutral-700">
                {cart.tableNumber ? `Table ${cart.tableNumber}` : cart.channel}
              </span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              <CategoryPill active={menuCategory === "all"} label="All" onClick={() => setMenuCategory("all")} />
              {categories.map((c) => (
                <CategoryPill key={c.id} active={menuCategory === c.id} label={c.name} onClick={() => setMenuCategory(c.id)} />
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 pb-24">
            <div className="space-y-2.5">
              {menuDishes.map((dish) => {
                const qty = qtyFor(dish.id);
                const price = priceFor(dish);
                return (
                  <div
                    key={dish.id}
                    className={`flex items-center gap-3 rounded-2xl border bg-white p-3 ${
                      dish.outOfStock ? "opacity-60" : qty > 0 ? "border-teal-400 ring-1 ring-teal-100" : "border-neutral-200"
                    }`}
                  >
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl"
                      style={{ backgroundColor: dish.color }}
                    >
                      {dish.emoji}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-neutral-900">{dish.name}</div>
                      <div className="text-sm text-neutral-500">{formatMoney(price, currencySymbol)}</div>
                    </div>
                    {dish.outOfStock ? (
                      <span className="flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-700">
                        <Ban className="h-3 w-3" /> Sold Out
                      </span>
                    ) : (
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          onClick={() => decrementCartItem(dish.id)}
                          disabled={qty === 0}
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 text-neutral-500 disabled:opacity-30"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="w-5 text-center text-base font-bold text-neutral-800">{qty}</span>
                        <button
                          onClick={() => addToCart(dish)}
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand)] text-white active:scale-90"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {menuDishes.length === 0 && (
                <div className="py-16 text-center text-sm text-neutral-400">No dishes in this category.</div>
              )}
            </div>
          </div>

          <button
            onClick={() => setScreen("cart")}
            disabled={itemCount === 0}
            className="fixed inset-x-3 bottom-3 flex items-center justify-between rounded-2xl bg-[var(--brand)] px-5 py-4 text-white shadow-lg disabled:bg-neutral-300"
          >
            <span className="flex items-center gap-2 font-semibold">
              <ShoppingCart className="h-5 w-5" /> {itemCount} item{itemCount === 1 ? "" : "s"}
            </span>
            <span className="font-bold">{formatMoney(total, currencySymbol)}</span>
          </button>
        </div>
      )}

      {screen === "cart" && (
        <div className="flex flex-1 min-h-0 flex-col">
          <div className="border-b border-neutral-200 bg-white p-3">
            <BackHeader label="Review Order" onBack={() => setScreen("menu")} />
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {cart.items.length === 0 ? (
              <p className="py-10 text-center text-sm text-neutral-400">No items yet.</p>
            ) : (
              <div className="mb-5 space-y-2">
                {cart.items.map((item) => (
                  <div key={item.dishId} className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-neutral-800">{item.name}</div>
                      <div className="text-xs text-neutral-400">{formatMoney(item.price, currencySymbol)} each</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => decrementCartItem(item.dishId)}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 text-neutral-500"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-5 text-center text-sm font-bold text-neutral-800">{item.qty}</span>
                      <button
                        onClick={() => {
                          const dish = dishes.find((d) => d.id === item.dishId);
                          if (dish) addToCart(dish);
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--brand)] text-white"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {cart.channel === "Dine in" && (
              <div className="mb-5 flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-3">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-neutral-700">
                  <Users className="h-4 w-4" /> Guests
                </span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => adjustGuests(-1)}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 text-neutral-500"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-6 text-center text-base font-bold text-neutral-800">{cart.guests}</span>
                  <button
                    onClick={() => adjustGuests(1)}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand)] text-white"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {(cart.channel === "Take Away" || cart.channel === "Delivery") && (
              <div className="mb-5 space-y-2">
                <input
                  value={cart.customerName}
                  onChange={(e) => setCart((c) => ({ ...c, customerName: e.target.value }))}
                  placeholder="Customer name"
                  className="w-full rounded-xl border border-neutral-200 px-3.5 py-3 text-sm focus:border-teal-500 focus:outline-none"
                />
                <input
                  value={cart.customerPhone}
                  onChange={(e) => setCart((c) => ({ ...c, customerPhone: e.target.value }))}
                  placeholder="Phone number"
                  className="w-full rounded-xl border border-neutral-200 px-3.5 py-3 text-sm focus:border-teal-500 focus:outline-none"
                />
              </div>
            )}

            <div className="space-y-1.5 rounded-xl bg-white p-3.5 text-sm">
              <div className="flex justify-between text-neutral-500">
                <span>Subtotal</span>
                <span>{formatMoney(subtotal, currencySymbol)}</span>
              </div>
              <div className="flex justify-between text-neutral-500">
                <span>Tax (6%)</span>
                <span>{formatMoney(subtotal * TAX_RATE, currencySymbol)}</span>
              </div>
              <div className="flex justify-between border-t border-neutral-100 pt-1.5 text-base font-bold text-neutral-900">
                <span>Total</span>
                <span>{formatMoney(total, currencySymbol)}</span>
              </div>
            </div>
            <p className="mt-3 text-center text-xs text-neutral-400">Payment is taken at the till — this just sends the order to the kitchen.</p>
          </div>
          <div className="border-t border-neutral-200 bg-white p-3">
            <button
              onClick={send}
              disabled={cart.items.length === 0 || sending}
              className="w-full rounded-2xl bg-[var(--brand)] py-4 text-base font-bold text-white active:scale-95 disabled:bg-neutral-300"
            >
              {sending ? "Sending…" : "Send to Kitchen"}
            </button>
            <button onClick={startOver} className="mt-2 w-full py-2 text-center text-xs font-medium text-neutral-400">
              Cancel this order
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function BackHeader({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 text-neutral-500">
        <ArrowLeft className="h-4 w-4" />
      </button>
      <h1 className="text-base font-bold text-neutral-900">{label}</h1>
    </div>
  );
}

function CategoryPill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold ${
        active ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-neutral-200 bg-white text-neutral-600"
      }`}
    >
      {label}
    </button>
  );
}
