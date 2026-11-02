"use client";

import { useMemo, useState, useTransition } from "react";
import type { Category, Dish, OrderItem, RestaurantTable } from "@/lib/types";
import { formatMoney, itemsSubtotal, lineTotal } from "@/lib/types";
import { placePublicOrderAction, placeTableQrOrderAction } from "@/lib/actions/public-order";
import { applyPromotions, type PromotionDef } from "@/lib/promotions";
import type { VariantLite } from "@/lib/variants";
import { VariantPicker } from "@/app/order-line/variant-picker";
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
  tableQr,
  shop,
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
  // Absent for a table-QR order, which has no sign-in at all.
  loyaltyMember?: { code: string; name: string | null };
  // Set when the customer scanned a table's QR code: the table is fixed by the signed token, and
  // checkout asks for a name + email or phone instead of relying on a signed-in account.
  tableQr?: { token: string; tableNumber: number };
  // A shop's online store (docs/retail-plan step 5.6): click & collect / delivery instead of tables,
  // size / colour pickers, "x left", search, and live promotions.
  shop?: {
    channels: ("Click & collect" | "Delivery")[];
    variantsByDish: Record<string, VariantLite[]>;
    stockByDish: Record<string, number>;
    promotions: PromotionDef[];
  };
}) {
  const [shopChannel, setShopChannel] = useState<"Click & collect" | "Delivery">(shop?.channels[0] ?? "Click & collect");
  const channel: "Dine in" | "Take Away" | "Click & collect" | "Delivery" = shop ? shopChannel : qrTableOrderingEnabled ? "Dine in" : "Take Away";
  const [customerAddress, setCustomerAddress] = useState("");
  const [search, setSearch] = useState("");
  const [variantPickFor, setVariantPickFor] = useState<Dish | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [items, setItems] = useState<OrderItem[]>([]);
  const [menuCategory, setMenuCategory] = useState("all");
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [tableNumber, setTableNumber] = useState<number | null>(initialTableNumber);
  const [guests, setGuests] = useState(2);
  const [customerName, setCustomerName] = useState(loyaltyMember?.name ?? "");
  const [customerPhone, setCustomerPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const priceFor = (dish: Dish) => dish.channelPrices?.[channel] ?? dish.price;

  const menuDishes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return dishes.filter(
      (d) => (menuCategory === "all" || d.categoryId === menuCategory) && !d.outOfStock && (!q || d.name.toLowerCase().includes(q) || (d.brand ?? "").toLowerCase().includes(q))
    );
  }, [dishes, menuCategory, search]);

  const qtyFor = (dishId: string) => items.filter((i) => i.dishId === dishId).reduce((s, i) => s + i.qty, 0);
  const lineKey = (i: Pick<OrderItem, "dishId" | "variantId">) => `${i.dishId}:${i.variantId ?? ""}`;
  // How many of a tracked product (or one variant) are left to order, null = not tracked.
  const leftFor = (dish: Dish, variant?: VariantLite): number | null => {
    if (variant) return variant.qty == null ? null : Math.floor(variant.qty + 1e-9);
    const n = shop?.stockByDish[dish.id];
    return n == null ? null : Math.floor(n + 1e-9);
  };
  const inBasket = (dishId: string, variantId?: string) => items.filter((i) => i.dishId === dishId && (variantId ? i.variantId === variantId : true)).reduce((s, i) => s + i.qty, 0);

  function addItem(dish: Dish, variant?: VariantLite) {
    const variants = shop?.variantsByDish[dish.id];
    if (variants?.length && !variant) {
      setVariantPickFor(dish);
      return;
    }
    const left = leftFor(dish, variant);
    if (left != null && inBasket(dish.id, variant?.id) >= left) {
      setError(`Only ${left} of ${variant ? `${dish.name} — ${variant.name}` : dish.name} in stock.`);
      return;
    }
    setError(null);
    setItems((prev) => {
      const key = lineKey({ dishId: dish.id, variantId: variant?.id });
      const existing = prev.find((i) => lineKey(i) === key);
      if (existing) return prev.map((i) => (lineKey(i) === key ? { ...i, qty: i.qty + 1 } : i));
      return [...prev, { dishId: dish.id, name: variant ? `${dish.name} — ${variant.name}` : dish.name, price: variant?.price ?? priceFor(dish), qty: 1, ...(variant ? { variantId: variant.id } : {}) }];
    });
  }

  function decrementItem(key: string) {
    setItems((prev) => prev.map((i) => (lineKey(i) === key ? { ...i, qty: i.qty - 1 } : i)).filter((i) => i.qty > 0));
  }

  // Promotions are priced live (the server prices them again when the order is placed).
  const categoryByDish = useMemo(() => new Map(dishes.map((d) => [d.id, d.categoryId])), [dishes]);
  const [promoNow] = useState(() => Date.now());
  const priced = useMemo(
    () => (shop ? applyPromotions(items, shop.promotions, { now: promoNow, channel, categoryOf: (id) => categoryByDish.get(id) ?? null }).items : items),
    [items, shop, promoNow, channel, categoryByDish]
  );
  const total = itemsSubtotal(priced);
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
    if (channel === "Delivery" && !customerAddress.trim()) {
      setError("Enter the delivery address.");
      return;
    }
    if (!customerPhone.trim()) {
      setError(tableQr ? "Enter your email or phone number." : "Enter your phone number.");
      return;
    }
    if (tableQr) {
      startTransition(async () => {
        const result = await placeTableQrOrderAction({ token: tableQr.token, items, guests, customerName, contact: customerPhone });
        if (result.error) {
          setError(result.error);
          return;
        }
        setOrderNumber(result.orderNumber ?? null);
        setCheckoutOpen(false);
        setCartOpen(false);
        setItems([]);
      });
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
        customerAddress: channel === "Delivery" ? customerAddress : undefined,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setNotice(result.notice ?? null);
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
          <h1 className="mb-1 text-lg font-semibold text-neutral-900">Order received!</h1>
          <p className="mb-4 text-sm text-neutral-500">
            Order #{orderNumber}
            {tableQr ? ` · Table ${tableQr.tableNumber}` : ""} · The team will confirm it shortly. {shop ? (channel === "Delivery" ? "You'll pay when it arrives." : "Pay when you collect it.") : "Pay at the counter when ready."}
          </p>
          {notice && <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">{notice}</p>}
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
          {tableQr ? (
            <div className="rounded-full bg-[var(--brand)] px-3 py-1 text-sm font-bold text-white">Table {tableQr.tableNumber}</div>
          ) : (
            loyaltyMember && (
              <div className="rounded-full bg-[var(--brand-light)] px-2.5 py-1 text-xs font-mono font-semibold text-[var(--brand-dark)]">
                {loyaltyMember.code}
              </div>
            )
          )}
        </div>
      </div>

      <div className="mx-auto max-w-xl px-4 py-4">
        {shop && (
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products"
            aria-label="Search products"
            className="mb-3 w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[var(--brand)]"
          />
        )}
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
            const dishVariants = shop?.variantsByDish[dish.id];
            const left = dishVariants?.length ? (dishVariants.every((v) => v.qty != null) ? dishVariants.reduce((s, v) => s + Math.max(0, v.qty ?? 0), 0) : null) : leftFor(dish);
            const soldOut = left != null && left <= 0;
            return (
              <div key={dish.id} className={`flex flex-col rounded-2xl border border-neutral-200 bg-white p-3 ${soldOut ? "opacity-50" : ""}`}>
                {dish.imageUrl ? (
                  <img src={dish.imageUrl} alt={dish.name} className="mb-2 h-16 w-16 rounded-xl object-cover" />
                ) : (
                  <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-xl text-2xl" style={{ backgroundColor: dish.color }}>
                    {dish.emoji}
                  </div>
                )}
                <div className="mb-1 line-clamp-1 text-sm font-semibold text-neutral-900">{dish.name}</div>
                {shop && (soldOut ? <div className="mb-1 text-xs font-semibold text-rose-600">Out of stock</div> : left != null && left <= 5 ? <div className="mb-1 text-xs font-medium text-amber-600">Only {Math.floor(left)} left</div> : null)}
                <div className="mt-auto flex items-center justify-between pt-1">
                  <span className="text-sm font-semibold text-neutral-800">{dishVariants?.length ? "From " : ""}{formatMoney(dishVariants?.length ? Math.min(...dishVariants.map((v) => v.price ?? priceFor(dish))) : priceFor(dish), currencySymbol)}</span>
                  {soldOut ? null : qty === 0 || dishVariants?.length ? (
                    <button
                      aria-label={`Add ${dish.name}`}
                      onClick={() => addItem(dish)}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--brand)] text-white"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => decrementItem(lineKey({ dishId: dish.id }))}
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

      {variantPickFor && shop && (
        <VariantPicker
          name={variantPickFor.name}
          variants={shop.variantsByDish[variantPickFor.id] ?? []}
          basePrice={priceFor(variantPickFor)}
          currencySymbol={currencySymbol}
          blockEmpty
          inBasket={(vid) => inBasket(variantPickFor.id, vid)}
          onClose={() => setVariantPickFor(null)}
          onPick={(v) => {
            const dish = variantPickFor;
            setVariantPickFor(null);
            addItem(dish, v);
          }}
        />
      )}

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
              {priced.map((item) => (
                <div key={lineKey(item)} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 text-neutral-700">
                    {item.qty}x {item.name}
                    {item.promo && <span className="block text-xs font-medium text-emerald-600">{item.promo.name} · saves {formatMoney(item.promo.saving, currencySymbol)}</span>}
                  </span>
                  <button onClick={() => decrementItem(lineKey(item))} className="shrink-0 rounded-full border border-neutral-200 p-1 text-neutral-400" aria-label={`Remove one ${item.name}`}>
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="font-semibold text-neutral-800">{formatMoney(lineTotal(item), currencySymbol)}</span>
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
                {tableQr ? (
                  <div className="mb-3 flex items-center justify-between rounded-xl bg-[var(--brand-light)] px-3.5 py-2.5 text-sm font-semibold text-[var(--brand-dark)]">
                    <span>Table {tableQr.tableNumber}</span>
                    <span className="text-xs font-medium">from your table&apos;s QR code</span>
                  </div>
                ) : (
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
                  </>
                )}

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

            {shop && shop.channels.length > 1 && (
              <div className="mb-3 grid grid-cols-2 gap-2">
                {shop.channels.map((c) => (
                  <button key={c} type="button" onClick={() => setShopChannel(c)} className={`rounded-xl border py-2.5 text-sm font-semibold ${shopChannel === c ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-neutral-200 text-neutral-600"}`}>
                    {c}
                  </button>
                ))}
              </div>
            )}
            <label className="mb-1 block text-xs font-medium text-neutral-500">Your Name</label>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g. Sarah"
              className="mb-3 w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-[var(--brand)]"
            />
            <label className="mb-1 block text-xs font-medium text-neutral-500">{tableQr ? "Email or Phone Number" : "Phone Number"}</label>
            <input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder={tableQr ? "you@example.com or +44 7000 000000" : "+44 7000 000000"}
              className="mb-4 w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-[var(--brand)]"
            />

            {channel === "Delivery" && (
              <>
                <label className="mb-1 block text-xs font-medium text-neutral-500">Delivery address</label>
                <textarea
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  rows={2}
                  aria-label="Delivery address"
                  className="mb-4 w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-[var(--brand)]"
                />
              </>
            )}

            <div className="mb-4 flex items-center gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs text-amber-700">
              <CreditCard className="h-4 w-4 shrink-0" /> {shop ? (channel === "Delivery" ? "Pay on delivery — this order isn't paid online." : "Pay when you collect — this order isn't paid online.") : "Pay at the counter — this order isn't paid online."}
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
