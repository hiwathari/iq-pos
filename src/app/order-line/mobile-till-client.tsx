"use client";

import { FloorLabel } from "@/components/floor-icons";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { placeOrderAction, voidOrderAction } from "@/lib/actions/orders";
import { formatMoney, itemsRawTax, itemsSubtotal, roundMoney } from "@/lib/types";
import { canonicalCode, parseEmbedded, type EmbeddedFormat } from "@/lib/barcode";
import { formatQty } from "@/lib/units";
import { useBarcodeScanner } from "@/lib/use-barcode-scanner";
import { playScanBeep } from "@/lib/order-sounds";
import { logAgeRefusalAction } from "@/lib/actions/age-checks";
import { WeightPad } from "./weight-pad";
import { applyPromotions, stripPromo, type PromotionDef } from "@/lib/promotions";
import { AgeCheckModal } from "./age-check-modal";
import { useTillZoom, ZoomButtons } from "./till-zoom";
import type { Category, Dish, Order, OrderChannel, OrderItem, RestaurantTable, ThirdPartyProvider } from "@/lib/types";
import {
  ArrowLeft,
  Ban,
  Bike,
  ChevronRight,
  Globe,
  MessageSquarePlus,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  ShoppingCart,
  Store,
  Users,
  UtensilsCrossed,
  Wallet,
  X,
} from "lucide-react";

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
  // Null (the default) keeps today's behavior — unpaid, settled later on the Full Till. "Cash"
  // marks it paid in full immediately so it shows correctly in Reports/shift reconciliation (and,
  // for a cafe, saves it straight as Served — see placeOrderAction). Card payments aren't offered
  // here since those go through a live terminal charge (SumUp/Teya) that this simplified flow has
  // no room to wait on; use the Full Till.
  paymentMethod: "Cash" | null;
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
  paymentMethod: null,
};

// Matches the Till's own definition — a paid-and-served order is done, so tapping its table
// starts a fresh one instead of loading a closed ticket back up.
function isOrderClosedOut(o: Order) {
  return o.status === "Served" && !!o.paymentMethod;
}

// Every order type the Simple Till can show; the business type (lib/business-profile.ts) picks
// which ones, in its own order.
const CHANNEL_BUTTONS: Record<OrderChannel, { label: string; icon: typeof UtensilsCrossed }> = {
  "Dine in": { label: "Dine In", icon: UtensilsCrossed },
  "Take Away": { label: "Take Away", icon: ShoppingBag },
  "Wait List": { label: "Wait List", icon: Users },
  Delivery: { label: "Delivery", icon: Bike },
  Online: { label: "Online", icon: Globe },
  "Third Party": { label: "Third Party", icon: Store },
  "In store": { label: "In Store", icon: Store },
  "Click & collect": { label: "Click & Collect", icon: ShoppingBag },
};

export function MobileTillClient({
  categories,
  dishes,
  tables,
  orders,
  currencySymbol,
  restaurantName,
  taxEnabled,
  onSwitchToFull,
  hasKitchen,
  channels,
  barcodesByDish,
  embeddedFormats,
  promotions = [],
  variantsByDish = {},
  floors = ["Ground Floor"],
}: {
  categories: Category[];
  dishes: Dish[];
  tables: RestaurantTable[];
  orders: Order[];
  currencySymbol: string;
  restaurantName: string;
  taxEnabled: boolean;
  onSwitchToFull: () => void;
  hasKitchen: boolean;
  // Order types to offer (lib/business-profile.ts) — table seating is only reached via Dine in,
  // which shops don't have, so no separate tables switch is needed here.
  channels: OrderChannel[];
  // Scanning (docs/retail-plan step 3.1): the Simple Till finds products by barcode too.
  barcodesByDish: Record<string, { code: string; packQty: number }[]>;
  embeddedFormats: EmbeddedFormat[];
  promotions?: PromotionDef[];
  variantsByDish?: Record<string, unknown[]>;
  floors?: string[];
}) {
  const router = useRouter();
  const zoom = useTillZoom();
  const [, startTransition] = useTransition();
  const [screen, setScreen] = useState<Screen>("channel");
  const [cart, setCart] = useState<SimpleCart>(emptyCart);
  const [tablesAreaChosen, setTablesArea] = useState<string>(floors[0] ?? "Ground Floor");
  const tablesArea = floors.includes(tablesAreaChosen) ? tablesAreaChosen : (floors[0] ?? "Ground Floor");
  const [menuCategory, setMenuCategory] = useState("all");
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Search (the magnifier in the menu header): by name, SKU or barcode; while there is text it
  // looks across every category.
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  // The line whose kitchen note is being typed (lineId, or dishId for a counted line).
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const menuDishes = useMemo(() => {
    const query = search.trim().toLowerCase();
    return dishes.filter((d) => {
      if (query) {
        return (
          d.name.toLowerCase().includes(query) ||
          (d.sku ?? "").toLowerCase() === query ||
          (barcodesByDish[d.id] ?? []).some((b) => b.code === query)
        );
      }
      return menuCategory === "all" || d.categoryId === menuCategory;
    });
  }, [dishes, menuCategory, search, barcodesByDish]);
  const areaTables = useMemo(() => tables.filter((t) => t.area === tablesArea), [tables, tablesArea]);

  const priceFor = (dish: Dish) => {
    const key = cart.channel === "Third Party" ? cart.thirdPartyProvider : cart.channel;
    return dish.channelPrices?.[key] ?? dish.price;
  };
  const taxRateFor = (dish: Dish) => {
    if (!taxEnabled) return 0;
    // A product's own VAT rate (e.g. crisps in a zero-rated category) wins over its category's.
    if (dish.taxRateOverride != null) return dish.taxRateOverride;
    const category = categories.find((c) => c.id === dish.categoryId);
    return category?.taxRatePercent ?? 0;
  };
  // A note for the kitchen on a line ("no onions") — kept on the line itself, so it is sent with
  // the order and shown on the kitchen ticket.
  function updateItemNote(key: string, note: string) {
    setCart((prev) => ({ ...prev, items: prev.items.map((i) => ((i.lineId ?? i.dishId) === key ? { ...i, note: note || undefined } : i)) }));
  }
  const qtyFor = (dishId: string) => cart.items.find((i) => i.dishId === dishId)?.qty ?? 0;
  // Promotions (step 5.3): totals use the basket priced with every live promotion; the server
  // recomputes the same when the order is sent.
  const [promoNow, setPromoNow] = useState(() => Date.now());
  useEffect(() => {
    if (promotions.length === 0) return;
    const t = setInterval(() => setPromoNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, [promotions.length]);
  const categoryByDish = useMemo(() => new Map(dishes.map((d) => [d.id, d.categoryId])), [dishes]);
  const pricedItems = useMemo(
    () => applyPromotions(cart.items, promotions, { now: promoNow, channel: cart.channel, categoryOf: (id) => categoryByDish.get(id) ?? null }).items,
    [cart.items, cart.channel, promotions, promoNow, categoryByDish]
  );
  const subtotal = itemsSubtotal(pricedItems);
  const tax = roundMoney(itemsRawTax(pricedItems));
  const total = roundMoney(subtotal + tax);
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
    if (activeOrder?.status === "Pending") {
      // A customer's order waiting for acceptance — editing it here would skip that step.
      window.alert(`Table ${table.number} has a new customer order waiting. Accept it on the full Till first.`);
      return;
    }
    if (activeOrder) {
      setCart({
        editingOrderId: activeOrder.id,
        tableId: table.id,
        tableNumber: table.number,
        guests: activeOrder.guests,
        channel: "Dine in",
        thirdPartyProvider: "Uber Eats",
        items: activeOrder.items.map((i) => ({ ...stripPromo(i) })),
        customerName: "",
        customerPhone: "",
        paymentMethod: null,
      });
    } else {
      setCart((c) => ({ ...emptyCart, channel: "Dine in", tableId: table.id, tableNumber: table.number, guests: c.guests }));
    }
    setMenuCategory("all");
    setScreen("menu");
  }

  // Same rules as the full Till (docs/retail-plan Phase 3): Challenge 25 once per sale per age,
  // the weight pad for products sold by weight / volume / length, and a line of its own for each
  // weighing; counted products add up on one line.
  function addToCart(dish: Dish, opts: { qty?: number; packQty?: number; fixedTotal?: number; ageCheck?: OrderItem["ageCheck"] } = {}) {
    if (dish.outOfStock) return;
    // Sizes / colours and serial numbers need the full Till's pickers.
    if ((variantsByDish[dish.id]?.length ?? 0) > 0 || dish.trackSerials) {
      alert(`${dish.name} comes in options or needs a serial number — sell it on the full Till (tap "Full Till").`);
      return;
    }
    const approved = opts.ageCheck ?? cart.items.find((i) => i.ageCheck && i.ageCheck.minAge >= (dish.minAge ?? 0))?.ageCheck;
    if (dish.minAge && !approved) {
      setAgeFor({ dish, opts });
      return;
    }
    const measured = dish.sellBy !== "unit";
    if (measured && opts.qty == null) {
      setPadDish({ dish, ageCheck: approved });
      return;
    }
    const add = opts.qty ?? opts.packQty ?? 1;
    setCart((prev) => {
      const existing = !measured && opts.fixedTotal == null ? prev.items.find((i) => i.dishId === dish.id && !i.lineId) : undefined;
      if (existing) {
        return { ...prev, items: prev.items.map((i) => (i === existing ? { ...i, qty: i.qty + add } : i)) };
      }
      return {
        ...prev,
        items: [
          ...prev.items,
          {
            dishId: dish.id,
            name: dish.name,
            price: priceFor(dish),
            qty: add,
            taxRate: taxRateFor(dish),
            ...(measured || opts.fixedTotal != null ? { lineId: crypto.randomUUID() } : {}),
            ...(measured ? { sellBy: dish.sellBy, unit: dish.unit } : {}),
            ...(opts.fixedTotal != null ? { fixedTotal: opts.fixedTotal } : {}),
            ...(dish.minAge && approved ? { ageCheck: approved } : {}),
          },
        ],
      };
    });
  }

  // A weighed line comes off whole; a counted one goes down by one.
  function decrementCartItem(dishId: string, lineId?: string) {
    setCart((prev) => ({
      ...prev,
      items: prev.items
        .map((i) => (lineId ? (i.lineId === lineId ? { ...i, qty: 0 } : i) : i.dishId === dishId && !i.lineId ? { ...i, qty: i.qty - 1 } : i))
        .filter((i) => i.qty > 0),
    }));
  }

  const [padDish, setPadDish] = useState<{ dish: Dish; ageCheck?: OrderItem["ageCheck"] } | null>(null);
  const [ageFor, setAgeFor] = useState<{ dish: Dish; opts: { qty?: number; packQty?: number; fixedTotal?: number } } | null>(null);

  // Scanning (hardware scanner): barcode → scale label → SKU, as on the full Till.
  const barcodeIndex = useMemo(() => {
    const m = new Map<string, { dish: Dish; packQty: number }>();
    for (const d of dishes) for (const b of barcodesByDish[d.id] ?? []) m.set(b.code, { dish: d, packQty: b.packQty });
    return m;
  }, [dishes, barcodesByDish]);
  useBarcodeScanner((raw) => {
    const code = canonicalCode(raw);
    const hit = barcodeIndex.get(code);
    const emb = hit ? null : parseEmbedded(code, embeddedFormats);
    const pluDish = emb ? dishes.find((d) => d.plu && d.plu.replace(/^0+/, "") === emb.plu.replace(/^0+/, "")) : undefined;
    const skuDish = hit || pluDish ? undefined : dishes.find((d) => d.sku && d.sku.toLowerCase() === raw.trim().toLowerCase());
    if (screen === "channel") setScreen("menu");
    if (hit) addToCart(hit.dish, { packQty: hit.packQty });
    else if (emb && pluDish) {
      if (emb.weight != null) addToCart(pluDish, { qty: emb.weight });
      else if (emb.price != null) addToCart(pluDish, { qty: pluDish.sellBy !== "unit" && pluDish.price > 0 ? Math.round((emb.price / pluDish.price) * 1000) / 1000 : 1, fixedTotal: emb.price });
    } else if (skuDish) addToCart(skuDish);
    else {
      playScanBeep(false);
      setToast(`Barcode ${code} isn't on any product`);
      setTimeout(() => setToast(null), 3500);
      return;
    }
    playScanBeep(true);
  }, !padDish && !ageFor);

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

  // Void order (top of Review Order): cancels every item at once. An order already sent is voided
  // (stock returned); a new one still being built is just cleared.
  function voidWholeOrder() {
    const sent = !!cart.editingOrderId;
    if (!window.confirm(sent ? "Void this whole order? Everything on it is cancelled." : `Cancel all ${cart.items.length} item${cart.items.length === 1 ? "" : "s"} in this order?`)) return;
    const id = cart.editingOrderId;
    startOver();
    if (id) {
      startTransition(async () => {
        await voidOrderAction(id, "Voided from the mobile Till");
        router.refresh();
        setToast("Order voided");
        setTimeout(() => setToast(null), 3000);
      });
    }
  }

  function send() {
    if (cart.items.length === 0 || sending) return;
    setSending(true);
    startTransition(async () => {
      const result = await placeOrderAction({
        editingOrderId: cart.editingOrderId,
        tableId: cart.tableId,
        tableNumber: cart.tableNumber,
        guests: cart.guests,
        channel: cart.channel,
        thirdPartyProvider: cart.channel === "Third Party" ? cart.thirdPartyProvider : undefined,
        items: cart.items,
        payments: cart.paymentMethod ? [{ method: cart.paymentMethod, amount: total }] : [],
        customerName: cart.customerName.trim() || undefined,
        customerPhone: cart.customerPhone.trim() || undefined,
      });
      if (result && "error" in result) {
        setSending(false);
        setToast(result.error);
        setTimeout(() => setToast(null), 6000);
        return;
      }
      router.refresh();
      setToast(
        result?.stockWarnings?.length
          ? `Sent — stock now below zero: ${result.stockWarnings.join(", ")}`
          : cart.tableNumber
            ? `Sent to Table ${cart.tableNumber}`
            : `Sent — ${cart.channel}`
      );
      setSending(false);
      setCart(emptyCart);
      setMenuCategory("all");
      setScreen("channel");
      setTimeout(() => setToast(null), 3500);
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-50" style={{ zoom: zoom.scale }}>
      {toast && (
        <div className="absolute left-1/2 top-3 z-50 -translate-x-1/2 rounded-full bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      )}
      {padDish && (
        <WeightPad
          mode="weight"
          name={padDish.dish.name}
          unit={padDish.dish.unit}
          price={priceFor(padDish.dish)}
          minQty={padDish.dish.minQty}
          qtyStep={padDish.dish.qtyStep}
          tare={padDish.dish.tare}
          currencySymbol={currencySymbol}
          onConfirm={(qty) => {
            const { dish, ageCheck } = padDish;
            setPadDish(null);
            addToCart(dish, { qty, ageCheck });
          }}
          onClose={() => setPadDish(null)}
        />
      )}
      {ageFor && (
        <AgeCheckModal
          productName={ageFor.dish.name}
          minAge={ageFor.dish.minAge ?? 18}
          onApprove={(method) => {
            const { dish, opts } = ageFor;
            setAgeFor(null);
            addToCart(dish, { ...opts, ageCheck: { minAge: dish.minAge ?? 18, method } });
          }}
          onRefuse={() => {
            const dish = ageFor.dish;
            setAgeFor(null);
            logAgeRefusalAction({ dishId: dish.id, productName: dish.name, minAge: dish.minAge ?? 18 }).catch(() => {});
            setToast(`Sale of ${dish.name} refused — logged`);
            setTimeout(() => setToast(null), 3500);
          }}
        />
      )}

      {screen === "channel" && (
        <div className="flex flex-1 flex-col p-4">
          <div className="mb-1 flex items-center justify-between">
            <h1 className="text-lg font-bold text-neutral-900">{restaurantName}</h1>
            <div className="flex items-center gap-3">
              <ZoomButtons zoom={zoom} />
              <button onClick={onSwitchToFull} className="text-xs font-medium text-neutral-400 underline underline-offset-2">
                Full Till
              </button>
            </div>
          </div>
          <p className="mb-5 text-sm text-neutral-400">What kind of order is this?</p>
          <div className="grid grid-cols-2 gap-3">
            {channels.map((channel) => ({ channel, ...CHANNEL_BUTTONS[channel] })).map(({ channel, label, icon: Icon }) => (
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
            {floors.map((a) => (
              <button
                key={a}
                onClick={() => setTablesArea(a)}
                className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${
                  tablesArea === a ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-neutral-200 bg-white text-neutral-600"
                }`}
              >
                <FloorLabel name={a} />
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
              <button
                onClick={() => {
                  setSearchOpen((o) => !o);
                  if (searchOpen) setSearch("");
                }}
                aria-label="Search items"
                title="Search items"
                className={`flex h-9 w-9 items-center justify-center rounded-full border ${searchOpen || search ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-neutral-200 text-neutral-500"}`}
              >
                <Search className="h-4 w-4" />
              </button>
            </div>
            {searchOpen && (
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-300" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search items, SKU or barcode…"
                  aria-label="Search items"
                  className="w-full rounded-xl border border-neutral-200 py-2.5 pl-9 pr-9 text-base outline-none focus:border-[var(--brand)]"
                />
                {search && (
                  <button onClick={() => setSearch("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-neutral-400">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
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
                // The counted line of this dish (a note goes on the whole line); weighed items get theirs in Review Order.
                const line = dish.sellBy === "unit" ? cart.items.find((i) => i.dishId === dish.id && !i.lineId) : undefined;
                return (
                  <div key={dish.id}>
                  <div
                    className={`flex items-center gap-3 rounded-2xl border bg-white p-3 ${
                      dish.outOfStock ? "opacity-60" : qty > 0 ? "border-teal-400 ring-1 ring-teal-100" : "border-neutral-200"
                    }`}
                  >
                    {dish.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={dish.imageUrl} alt={dish.name} className="h-12 w-12 shrink-0 rounded-full object-cover" />
                    ) : (
                      <div
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl"
                        style={{ backgroundColor: dish.color }}
                      >
                        {dish.emoji}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-neutral-900">{dish.name}</div>
                      <div className="text-sm text-neutral-500">
                        {formatMoney(price, currencySymbol)}
                        {dish.sellBy !== "unit" && ` / ${dish.unit}`}
                      </div>
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
                        {line && (
                          <button
                            onClick={() => setNoteFor(noteFor === dish.id ? null : dish.id)}
                            aria-label={`Add a note to ${dish.name}`}
                            title="Add a note for the kitchen"
                            className={`flex h-9 w-9 items-center justify-center rounded-full border ${line.note ? "border-amber-300 bg-amber-50 text-amber-600" : "border-neutral-200 text-neutral-400"}`}
                          >
                            <MessageSquarePlus className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {line?.note && noteFor !== dish.id && <div className="mx-2 mt-1 truncate text-sm italic text-amber-600">↳ {line.note}</div>}
                  {line && noteFor === dish.id && (
                    <input
                      autoFocus
                      value={line.note ?? ""}
                      onChange={(e) => updateItemNote(dish.id, e.target.value)}
                      onBlur={() => setNoteFor(null)}
                      onKeyDown={(e) => e.key === "Enter" && setNoteFor(null)}
                      maxLength={120}
                      placeholder="e.g. no onions, extra spicy…"
                      aria-label={`Note for ${dish.name}`}
                      className="mt-1.5 w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-base outline-none focus:border-amber-400"
                    />
                  )}
                  </div>
                );
              })}
              {menuDishes.length === 0 && (
                <div className="py-16 text-center text-sm text-neutral-400">{search ? "Nothing matches your search." : "No dishes in this category."}</div>
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
            <div className="flex items-center justify-between gap-3">
              <BackHeader label="Review Order" onBack={() => setScreen("menu")} />
              {(cart.editingOrderId || cart.items.length > 0) && (
                <button
                  onClick={voidWholeOrder}
                  aria-label="Void order"
                  className="flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3.5 py-2 text-sm font-semibold text-rose-600 active:scale-95"
                >
                  <Ban className="h-4 w-4" /> Void order
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {cart.items.length === 0 ? (
              <p className="py-10 text-center text-sm text-neutral-400">No items yet.</p>
            ) : (
              <div className="mb-5 space-y-2">
                {pricedItems.map((item) => {
                  const key = item.lineId ?? item.dishId;
                  return (
                  <div key={key} className="rounded-xl border border-neutral-200 bg-white p-3">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-neutral-800">{item.name}</div>
                      {item.promo && (
                        <div className="text-xs font-medium text-emerald-600">
                          {item.promo.name} · saves {formatMoney(item.promo.saving, currencySymbol)}
                        </div>
                      )}
                      <div className="text-xs text-neutral-400">
                        {item.sellBy && item.sellBy !== "unit" ? `${formatQty(item.qty, item.unit, item.sellBy)} @ ${formatMoney(item.price, currencySymbol)}/${item.unit}` : `${formatMoney(item.price, currencySymbol)} each`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setNoteFor(noteFor === key ? null : key)}
                        aria-label={`Add a note to ${item.name}`}
                        title="Add a note for the kitchen"
                        className={`flex h-8 w-8 items-center justify-center rounded-full border ${item.note ? "border-amber-300 bg-amber-50 text-amber-600" : "border-neutral-200 text-neutral-400"}`}
                      >
                        <MessageSquarePlus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => decrementCartItem(item.dishId, item.lineId)}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 text-neutral-500"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="min-w-5 text-center text-sm font-bold text-neutral-800">{item.sellBy && item.sellBy !== "unit" ? formatQty(item.qty, item.unit, item.sellBy) : item.qty}</span>
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
                  {item.note && noteFor !== key && <div className="mt-1 truncate text-sm italic text-amber-600">↳ {item.note}</div>}
                  {noteFor === key && (
                    <input
                      autoFocus
                      value={item.note ?? ""}
                      onChange={(e) => updateItemNote(key, e.target.value)}
                      onBlur={() => setNoteFor(null)}
                      onKeyDown={(e) => e.key === "Enter" && setNoteFor(null)}
                      maxLength={120}
                      placeholder="e.g. no onions, extra spicy…"
                      aria-label={`Note for ${item.name}`}
                      className="mt-2 w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-base outline-none focus:border-amber-400"
                    />
                  )}
                  </div>
                  );
                })}
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
              {tax > 0 && (
                <div className="flex justify-between text-neutral-500">
                  <span>Tax</span>
                  <span>{formatMoney(tax, currencySymbol)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-neutral-100 pt-1.5 text-base font-bold text-neutral-900">
                <span>Total</span>
                <span>{formatMoney(total, currencySymbol)}</span>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-neutral-200 p-1">
              <button
                onClick={() => setCart((c) => ({ ...c, paymentMethod: null }))}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold ${
                  cart.paymentMethod === null ? "bg-[var(--brand)] text-white" : "text-neutral-500"
                }`}
              >
                Pay Later
              </button>
              <button
                onClick={() => setCart((c) => ({ ...c, paymentMethod: "Cash" }))}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold ${
                  cart.paymentMethod === "Cash" ? "bg-[var(--brand)] text-white" : "text-neutral-500"
                }`}
              >
                <Wallet className="h-4 w-4" /> Cash
              </button>
            </div>
            <p className="mt-2 text-center text-xs text-neutral-400">
              {cart.paymentMethod
                ? "Marked paid in full — card payments need the Full Till instead."
                : hasKitchen
                  ? "Payment can be taken at the till later — this just sends the order to the kitchen."
                  : "Payment can be taken at the till later — this just places the order."}
            </p>
          </div>
          <div className="border-t border-neutral-200 bg-white p-3">
            <button
              onClick={send}
              disabled={cart.items.length === 0 || sending}
              className="w-full rounded-2xl bg-[var(--brand)] py-4 text-base font-bold text-white active:scale-95 disabled:bg-neutral-300"
            >
              {sending ? "Sending…" : cart.paymentMethod ? "Take Payment" : hasKitchen ? "Send to Kitchen" : "Place Order"}
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
