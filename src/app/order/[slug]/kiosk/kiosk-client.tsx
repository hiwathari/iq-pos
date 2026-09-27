"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { Category, Dish, LoyaltyContactType, OrderItem, RestaurantTable } from "@/lib/types";
import { formatMoney } from "@/lib/types";
import { placePublicOrderAction, kioskLoyaltyLookupAction } from "@/lib/actions/public-order";
import { ShoppingBag, Plus, Minus, ArrowLeft, CheckCircle2, Utensils, ShoppingBasket, CreditCard, Gift } from "lucide-react";

type Step = "welcome" | "channel" | "menu" | "checkout" | "done";

const RESET_DELAY_MS = 8000;

export function KioskClient({
  restaurantSlug,
  restaurantName,
  currencySymbol,
  logoUrl,
  qrTableOrderingEnabled,
  categories,
  dishes,
  tables,
}: {
  restaurantSlug: string;
  restaurantName: string;
  currencySymbol: string;
  logoUrl?: string | null;
  qrTableOrderingEnabled: boolean;
  categories: Category[];
  dishes: Dish[];
  tables: RestaurantTable[];
}) {
  const [step, setStep] = useState<Step>("welcome");
  const [channel, setChannel] = useState<"Dine in" | "Take Away">("Take Away");
  const [items, setItems] = useState<OrderItem[]>([]);
  const [menuCategory, setMenuCategory] = useState("all");
  const [tableNumber, setTableNumber] = useState<number | null>(null);
  const [guests, setGuests] = useState(2);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [loyaltyContact, setLoyaltyContact] = useState("");
  const [loyaltyMember, setLoyaltyMember] = useState<{ id: string; code: string } | null>(null);
  const [loyaltyError, setLoyaltyError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function resetAll() {
    setStep("welcome");
    setChannel("Take Away");
    setItems([]);
    setMenuCategory("all");
    setTableNumber(null);
    setGuests(2);
    setCustomerName("");
    setCustomerPhone("");
    setLoyaltyContact("");
    setLoyaltyMember(null);
    setLoyaltyError(null);
    setError(null);
    setOrderNumber(null);
  }

  useEffect(() => {
    if (step !== "done") return;
    const id = setTimeout(resetAll, RESET_DELAY_MS);
    return () => clearTimeout(id);
  }, [step]);

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

  function lookupLoyalty() {
    const contact = loyaltyContact.trim();
    if (!contact) return;
    const contactType: LoyaltyContactType = contact.includes("@") ? "email" : "phone";
    setLoyaltyError(null);
    startTransition(async () => {
      const result = await kioskLoyaltyLookupAction(restaurantSlug, contactType, contact, customerName);
      if (result.error || !result.member) {
        setLoyaltyError(result.error ?? "Couldn't look that up.");
        return;
      }
      setLoyaltyMember({ id: result.member.id, code: result.member.code });
    });
  }

  function submitOrder() {
    setError(null);
    if (channel === "Dine in" && !tableNumber) return setError("Select your table.");
    if (!customerName.trim()) return setError("Enter your name.");
    if (!customerPhone.trim()) return setError("Enter your phone number.");
    const table = channel === "Dine in" ? tables.find((t) => t.number === tableNumber) : undefined;
    startTransition(async () => {
      const result = await placePublicOrderAction({
        restaurantSlug,
        placedVia: "kiosk",
        channel,
        tableId: table?.id,
        guests,
        items,
        customerName,
        customerPhone,
        loyaltyMemberId: loyaltyMember?.id,
      });
      if (result.error) return setError(result.error);
      setOrderNumber(result.orderNumber ?? null);
      setStep("done");
    });
  }

  if (step === "welcome") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-6 text-center">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="mb-6 h-24 w-24 rounded-full object-cover" />
        ) : (
          <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-[var(--brand-light)] text-3xl font-bold text-[var(--brand-dark)]">
            {restaurantName.charAt(0)}
          </div>
        )}
        <h1 className="mb-2 text-3xl font-bold text-neutral-900">{restaurantName}</h1>
        <p className="mb-10 text-neutral-500">Tap below to start your order</p>
        <button
          onClick={() => {
            if (qrTableOrderingEnabled) {
              setStep("channel");
            } else {
              setChannel("Take Away");
              setStep("menu");
            }
          }}
          className="rounded-full bg-[var(--brand)] px-16 py-6 text-2xl font-bold text-white shadow-lg hover:bg-[var(--brand-dark)]"
        >
          Start Order
        </button>
      </div>
    );
  }

  if (step === "channel") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-6">
        <h1 className="mb-8 text-2xl font-bold text-neutral-900">How would you like to order?</h1>
        <div className="grid w-full max-w-md grid-cols-1 gap-4">
          <button
            onClick={() => {
              setChannel("Dine in");
              setStep("menu");
            }}
            className="flex items-center gap-4 rounded-2xl border-2 border-neutral-200 bg-white p-6 text-left hover:border-[var(--brand)]"
          >
            <Utensils className="h-8 w-8 text-[var(--brand)]" />
            <div>
              <div className="text-lg font-bold text-neutral-900">Dine In</div>
              <div className="text-sm text-neutral-500">I&apos;m seated at a table</div>
            </div>
          </button>
          <button
            onClick={() => {
              setChannel("Take Away");
              setStep("menu");
            }}
            className="flex items-center gap-4 rounded-2xl border-2 border-neutral-200 bg-white p-6 text-left hover:border-[var(--brand)]"
          >
            <ShoppingBasket className="h-8 w-8 text-[var(--brand)]" />
            <div>
              <div className="text-lg font-bold text-neutral-900">Take Away</div>
              <div className="text-sm text-neutral-500">I&apos;ll collect my order</div>
            </div>
          </button>
        </div>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-6 text-center">
        <CheckCircle2 className="mb-4 h-20 w-20 text-emerald-500" />
        <h1 className="mb-2 text-3xl font-bold text-neutral-900">Order #{orderNumber}</h1>
        <p className="text-neutral-500">Thanks, {customerName}! Please pay at the counter.</p>
        <p className="mt-8 text-sm text-neutral-400">Starting a new order shortly…</p>
      </div>
    );
  }

  if (step === "checkout") {
    return (
      <div className="mx-auto min-h-screen max-w-lg bg-neutral-50 px-6 py-8">
        <button onClick={() => setStep("menu")} className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-neutral-500">
          <ArrowLeft className="h-4 w-4" /> Back to menu
        </button>
        <h1 className="mb-5 text-2xl font-bold text-neutral-900">Checkout</h1>

        {channel === "Dine in" && (
          <>
            <label className="mb-1 block text-sm font-medium text-neutral-600">Table</label>
            <select
              value={tableNumber ?? ""}
              onChange={(e) => setTableNumber(Number(e.target.value) || null)}
              className="mb-4 w-full rounded-xl border border-neutral-200 px-4 py-3 text-base outline-none focus:border-[var(--brand)]"
            >
              <option value="">Select a table…</option>
              {tables.map((t) => (
                <option key={t.id} value={t.number}>
                  Table {t.number}
                </option>
              ))}
            </select>
            <label className="mb-1 block text-sm font-medium text-neutral-600">Guests</label>
            <div className="mb-4 flex items-center gap-3">
              <button onClick={() => setGuests((g) => Math.max(1, g - 1))} className="flex h-12 w-12 items-center justify-center rounded-xl border border-neutral-200">
                <Minus className="h-5 w-5" />
              </button>
              <div className="flex h-12 flex-1 items-center justify-center rounded-xl border border-neutral-200 text-lg font-semibold">{guests}</div>
              <button onClick={() => setGuests((g) => g + 1)} className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--brand)] text-white">
                <Plus className="h-5 w-5" />
              </button>
            </div>
          </>
        )}

        <label className="mb-1 block text-sm font-medium text-neutral-600">Your Name</label>
        <input
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="e.g. Sarah"
          className="mb-4 w-full rounded-xl border border-neutral-200 px-4 py-3 text-base outline-none focus:border-[var(--brand)]"
        />
        <label className="mb-1 block text-sm font-medium text-neutral-600">Phone Number</label>
        <input
          value={customerPhone}
          onChange={(e) => setCustomerPhone(e.target.value)}
          placeholder="+44 7000 000000"
          className="mb-4 w-full rounded-xl border border-neutral-200 px-4 py-3 text-base outline-none focus:border-[var(--brand)]"
        />

        <div className="mb-4 rounded-xl border border-neutral-200 bg-white p-4">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-neutral-700">
            <Gift className="h-4 w-4 text-[var(--brand)]" /> Loyalty Card
          </div>
          {loyaltyMember ? (
            <p className="text-sm text-emerald-600">Card {loyaltyMember.code} attached to this order.</p>
          ) : (
            <div className="flex items-center gap-2">
              <input
                value={loyaltyContact}
                onChange={(e) => setLoyaltyContact(e.target.value)}
                placeholder="Phone or email (optional)"
                className="flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
              />
              <button onClick={lookupLoyalty} className="shrink-0 rounded-lg bg-[var(--brand)] px-3 py-2 text-xs font-semibold text-white">
                Apply
              </button>
            </div>
          )}
          {loyaltyError && <p className="mt-2 text-xs font-medium text-rose-600">{loyaltyError}</p>}
        </div>

        <div className="mb-4 flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <CreditCard className="h-4 w-4 shrink-0" /> Pay at the counter — this order isn&apos;t paid on screen.
        </div>

        {error && <p className="mb-4 text-sm font-medium text-rose-600">{error}</p>}

        <button
          onClick={submitOrder}
          disabled={pending}
          className="w-full rounded-xl bg-[var(--brand)] py-4 text-lg font-bold text-white hover:bg-[var(--brand-dark)] disabled:opacity-50"
        >
          {pending ? "Placing Order…" : `Place Order · ${formatMoney(total, currencySymbol)}`}
        </button>
      </div>
    );
  }

  // step === "menu"
  return (
    <div className="min-h-screen bg-neutral-50 pb-28">
      <div className="sticky top-0 z-20 border-b border-neutral-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <h1 className="text-xl font-bold text-neutral-900">{restaurantName}</h1>
          <button onClick={resetAll} className="text-sm font-semibold text-neutral-400">
            Cancel
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-5">
        <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setMenuCategory("all")}
            className={`shrink-0 rounded-full border px-5 py-2.5 text-sm font-semibold ${
              menuCategory === "all" ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-neutral-200 bg-white text-neutral-600"
            }`}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setMenuCategory(c.id)}
              className={`shrink-0 rounded-full border px-5 py-2.5 text-sm font-semibold ${
                menuCategory === c.id ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-neutral-200 bg-white text-neutral-600"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {menuDishes.map((dish) => {
            const qty = qtyFor(dish.id);
            return (
              <div key={dish.id} className="flex flex-col rounded-2xl border border-neutral-200 bg-white p-4">
                {dish.imageUrl ? (
                  <img src={dish.imageUrl} alt={dish.name} className="mb-3 h-20 w-20 rounded-xl object-cover" />
                ) : (
                  <div className="mb-3 flex h-20 w-20 items-center justify-center rounded-xl text-3xl" style={{ backgroundColor: dish.color }}>
                    {dish.emoji}
                  </div>
                )}
                <div className="mb-1 font-semibold text-neutral-900">{dish.name}</div>
                <div className="mt-auto flex items-center justify-between pt-2">
                  <span className="font-semibold text-neutral-800">{formatMoney(priceFor(dish), currencySymbol)}</span>
                  {qty === 0 ? (
                    <button onClick={() => addItem(dish)} className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand)] text-white">
                      <Plus className="h-4 w-4" />
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button onClick={() => decrementItem(dish.id)} className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200">
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-5 text-center font-semibold">{qty}</span>
                      <button onClick={() => addItem(dish)} className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand)] text-white">
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {itemCount > 0 && (
        <button
          onClick={() => setStep("checkout")}
          className="fixed inset-x-6 bottom-6 z-30 mx-auto flex max-w-3xl items-center justify-between rounded-2xl bg-[var(--brand)] px-6 py-5 text-white shadow-lg"
        >
          <span className="flex items-center gap-2 text-lg font-bold">
            <ShoppingBag className="h-5 w-5" /> {itemCount} item{itemCount === 1 ? "" : "s"}
          </span>
          <span className="text-lg font-bold">{formatMoney(total, currencySymbol)} · Checkout</span>
        </button>
      )}
    </div>
  );
}
