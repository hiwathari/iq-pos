"use client";

import { useMemo, useState, useTransition } from "react";
import type { Category, Dish, OrderItem, RestaurantTable } from "@/lib/types";
import { formatMoney } from "@/lib/types";
import { placePublicOrderAction } from "@/lib/actions/public-order";
import { ShoppingBag, Plus, Minus, X, CreditCard, CheckCircle2, Users } from "lucide-react";

export function OnlineOrderClient({
  restaurantSlug,
  restaurantName,
  currencySymbol,
  logoUrl,
  qrTableOrderingEnabled,
  categories,
  dishes,
  tables,
  initialTableNumber,
  loyaltyMember,
}: {
  restaurantSlug: string;
  restaurantName: string;
  currencySymbol: string;
  logoUrl?: string | null;
  qrTableOrderingEnabled: boolean;
  categories: Category[];
  dishes: Dish[];
  tables: RestaurantTable[];
  initialTableNumber: number | null;
  loyaltyMember: { code: string; name: string | null };
}) {
  const channel: "Dine in" | "Take Away" = qrTableOrderingEnabled ? "Dine in" : "Take Away";

  const [items, setItems] = useState<OrderItem[]>([]);
  const [menuCategory, setMenuCategory] = useState("all");
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [tableNumber, setTableNumber] = useState<number | null>(initialTableNumber);
  const [guests, setGuests] = useState(2);
  const [customerName, setCustomerName] = useState(loyaltyMember.name ?? "");
  const [customerPhone, setCustomerPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const priceFor = (dish: Dish) => dish.channelPrices?.[channel] ?? dish.price;

  const menuDishes = useMemo(
    () => dishes.filter((d) => (menuCategory === "all" || d.categoryId === menuCategory) && !d.outOfStock),
    [dishes, menuCategory]
  );

  const qtyFor = (dishId: string) => items.find((i) => i.dishId === dishId)?.qty ?? 0;

  function addItem(dish: Dish) {
    setItems((prev) => {
      const existing = prev.find((i) => i.dishId === dish.id);
      if (existing) return prev.map((i) => (i.dishId === dish.id ? { ...i, qty: i.qty + 1 } : i));
      return [...prev, { dishId: dish.id, name: dish.name, price: priceFor(dish), qty: 1 }];
    });
  }

  function decrementItem(dishId: string) {
    setItems((prev) => prev.map((i) => (i.dishId === dishId ? { ...i, qty: i.qty - 1 } : i)).filter((i) => i.qty > 0));
  }

  const total = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const itemCount = items.reduce((sum, i) => sum + i.qty, 0);

  function submitOrder() {
    setError(null);
    if (channel === "Dine in" && !tableNumber) {
      setError("Select your table.");
      return;
    }
    if (!customerName.trim()) {
      setError("Enter your name.");
      return;
    }
    if (!customerPhone.trim()) {
      setError("Enter your phone number.");
      return;
    }
    const table = channel === "Dine in" ? tables.find((t) => t.number === tableNumber) : undefined;
    startTransition(async () => {
      const result = await placePublicOrderAction({
        restaurantSlug,
        placedVia: "online",
        channel,
        tableId: table?.id,
        guests,
        items,
        customerName,
        customerPhone,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setOrderNumber(result.orderNumber ?? null);
      setCheckoutOpen(false);
      setCartOpen(false);
      setItems([]);
    });
  }

  if (orderNumber) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-7 text-center shadow-sm">
          <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-500" />
          <h1 className="mb-1 text-lg font-semibold text-neutral-900">Order sent to the kitchen!</h1>
          <p className="mb-4 text-sm text-neutral-500">Order #{orderNumber} · Pay at the counter when ready.</p>
          <button
            onClick={() => setOrderNumber(null)}
            className="w-full rounded-xl bg-[var(--brand)] py-3 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]"
          >
            Order More
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 pb-24">
      <div className="sticky top-0 z-20 border-b border-neutral-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-xl items-center justify-between">
          <div className="flex items-center gap-2.5">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand-light)] text-sm font-bold text-[var(--brand-dark)]">
                {restaurantName.charAt(0)}
              </div>
            )}
            <div>
              <div className="text-sm font-semibold text-neutral-900">{restaurantName}</div>
              {channel === "Dine in" && tableNumber && <div className="text-xs text-neutral-400">Table {tableNumber}</div>}
            </div>
          </div>
          <div className="rounded-full bg-[var(--brand-light)] px-2.5 py-1 text-xs font-mono font-semibold text-[var(--brand-dark)]">
            {loyaltyMember.code}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-xl px-4 py-4">
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setMenuCategory("all")}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium ${
              menuCategory === "all" ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-neutral-200 bg-white text-neutral-600"
            }`}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setMenuCategory(c.id)}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium ${
                menuCategory === c.id ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-neutral-200 bg-white text-neutral-600"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {menuDishes.map((dish) => {
            const qty = qtyFor(dish.id);
            return (
              <div key={dish.id} className="flex flex-col rounded-2xl border border-neutral-200 bg-white p-3">
                {dish.imageUrl ? (
                  <img src={dish.imageUrl} alt={dish.name} className="mb-2 h-16 w-16 rounded-xl object-cover" />
                ) : (
                  <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-xl text-2xl" style={{ backgroundColor: dish.color }}>
                    {dish.emoji}
                  </div>
                )}
                <div className="mb-1 line-clamp-1 text-sm font-semibold text-neutral-900">{dish.name}</div>
                <div className="mt-auto flex items-center justify-between pt-1">
                  <span className="text-sm font-semibold text-neutral-800">{formatMoney(priceFor(dish), currencySymbol)}</span>
                  {qty === 0 ? (
                    <button
                      onClick={() => addItem(dish)}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--brand)] text-white"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => decrementItem(dish.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-neutral-200 text-neutral-500"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-4 text-center text-sm font-semibold">{qty}</span>
                      <button
                        onClick={() => addItem(dish)}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--brand)] text-white"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {menuDishes.length === 0 && <div className="col-span-full py-12 text-center text-sm text-neutral-400">No dishes in this category.</div>}
        </div>
      </div>

      {itemCount > 0 && !checkoutOpen && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed inset-x-4 bottom-4 z-30 mx-auto flex max-w-xl items-center justify-between rounded-2xl bg-[var(--brand)] px-5 py-4 text-white shadow-lg"
        >
          <span className="flex items-center gap-2 font-semibold">
            <ShoppingBag className="h-5 w-5" /> {itemCount} item{itemCount === 1 ? "" : "s"}
          </span>
          <span className="font-semibold">{formatMoney(total, currencySymbol)}</span>
        </button>
      )}

      {cartOpen && !checkoutOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={() => setCartOpen(false)}>
          <div className="max-h-[80vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-900">Your Order</h2>
              <button onClick={() => setCartOpen(false)} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.dishId} className="flex items-center justify-between text-sm">
                  <span className="text-neutral-700">
                    {item.qty}x {item.name}
                  </span>
                  <span className="font-semibold text-neutral-800">{formatMoney(item.price * item.qty, currencySymbol)}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-between border-t border-neutral-100 pt-3 text-base font-semibold text-neutral-900">
              <span>Total</span>
              <span>{formatMoney(total, currencySymbol)}</span>
            </div>
            <button
              onClick={() => setCheckoutOpen(true)}
              className="mt-4 w-full rounded-xl bg-[var(--brand)] py-3 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]"
            >
              Checkout
            </button>
          </div>
        </div>
      )}

      {checkoutOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={() => setCheckoutOpen(false)}>
          <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-900">Checkout</h2>
              <button onClick={() => setCheckoutOpen(false)} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            {channel === "Dine in" && (
              <>
                <label className="mb-1 block text-xs font-medium text-neutral-500">Table</label>
                <select
                  value={tableNumber ?? ""}
                  onChange={(e) => setTableNumber(Number(e.target.value) || null)}
                  className="mb-3 w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-[var(--brand)]"
                >
                  <option value="">Select a table…</option>
                  {tables.map((t) => (
                    <option key={t.id} value={t.number}>
                      Table {t.number}
                    </option>
                  ))}
                </select>

                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-neutral-500">
                  <Users className="h-3.5 w-3.5" /> Guests
                </label>
                <div className="mb-3 flex items-center gap-2">
                  <button
                    onClick={() => setGuests((g) => Math.max(1, g - 1))}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-200 text-neutral-500"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <div className="flex h-10 flex-1 items-center justify-center rounded-xl border border-neutral-200 font-semibold">{guests}</div>
                  <button
                    onClick={() => setGuests((g) => g + 1)}
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand)] text-white"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </>
            )}

            <label className="mb-1 block text-xs font-medium text-neutral-500">Your Name</label>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g. Sarah"
              className="mb-3 w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-[var(--brand)]"
            />
            <label className="mb-1 block text-xs font-medium text-neutral-500">Phone Number</label>
            <input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="+44 7000 000000"
              className="mb-4 w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-[var(--brand)]"
            />

            <div className="mb-4 flex items-center gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs text-amber-700">
              <CreditCard className="h-4 w-4 shrink-0" /> Pay at the counter — this order isn&apos;t paid online.
            </div>

            {error && <p className="mb-4 text-sm font-medium text-rose-600">{error}</p>}

            <button
              onClick={submitOrder}
              disabled={pending}
              className="w-full rounded-xl bg-[var(--brand)] py-3 text-sm font-bold text-white hover:bg-[var(--brand-dark)] disabled:opacity-50"
            >
              {pending ? "Placing Order…" : `Place Order · ${formatMoney(total, currencySymbol)}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
