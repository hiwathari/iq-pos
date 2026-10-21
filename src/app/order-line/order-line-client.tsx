"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  Category,
  Dish,
  Order,
  OrderChannel,
  OrderItem,
  OrderStatus,
  PaymentLine,
  PaymentTerminal,
  RestaurantTable,
  ThirdPartyProvider,
} from "@/lib/types";
import { formatMoney, formatOccupiedTime, formatOrderTimestamp, orderSequence, orderTotal } from "@/lib/types";
import {
  acceptOnlineOrderAction,
  mergeTableIntoOrderAction,
  placeOrderAction,
  rejectOnlineOrderAction,
  setOrderStatusAction,
  swapOrderTableAction,
  voidOrderAction,
} from "@/lib/actions/orders";
import { validateCouponAction } from "@/lib/actions/coupons";
import { lookupLoyaltyMemberByCodeAction, lookupOrCreateLoyaltyMemberAction } from "@/lib/actions/loyalty";
import type { LoyaltyContactType } from "@/lib/types";
import { freeTablesAction } from "@/lib/actions/tables";
import { setDishStockAction } from "@/lib/actions/menu";
import { printTicket } from "@/lib/print-ticket";
import { buildTicketEscPosAction } from "@/lib/actions/local-print";
import { printViaLocalBridge } from "@/lib/local-print-bridge";
import { tableOrderQrDataUrl } from "@/lib/table-qr";
import { unlockOrderAudio, playIncomingOrderAlert, playOrderReadyChime } from "@/lib/order-sounds";
import { SoundSettingsButton } from "@/components/sound-settings";
import { useVisibleInterval } from "@/lib/use-visible-interval";
import { startSumupChargeAction, pollSumupChargeAction, cancelSumupChargeAction } from "@/lib/actions/sumup";
import { startTeyaChargeAction, pollTeyaChargeAction, cancelTeyaChargeAction } from "@/lib/actions/teya";
import { businessDateKey, businessDayRange, businessDayStart, shiftDateKey } from "@/lib/business-day";
import { TableLayoutPicker } from "@/components/table-layout-picker";
import { CategoryIconView } from "@/components/category-icon";
import { FullscreenButton } from "@/components/fullscreen-button";
import {
  Minus,
  Plus,
  Trash2,
  Wallet,
  CreditCard,
  LayoutGrid,
  X,
  Printer,
  Ban,
  ShoppingBag,
  Bike,
  MapPin,
  Phone,
  User,
  MessageSquarePlus,
  Bell,
  BellRing,
  CheckCircle2,
  ClipboardList,
  Armchair,
  Users,
  Clock,
  Search,
  RefreshCw,
  XCircle,
  History,
  ArrowLeftRight,
  Combine,
  QrCode,
  ChevronLeft,
  ChevronRight,
  Globe,
  Loader2,
  ChevronDown,
  ChevronUp,
  TicketPercent,
} from "lucide-react";

const QUEUE_TABS = ["All", "Dine in", "Wait List", "Take Away", "Delivery", "Served"] as const;
type QueueTab = (typeof QUEUE_TABS)[number];

type TillView = "order" | "incoming" | "tickets" | "tables" | "history";

// A ticket is flagged "Updated" once it's been edited after being sent, so staff notice a
// change — cleared once it's done (Served/Voided), since it no longer needs a second look.
function wasOrderUpdated(o: Order) {
  return !!o.updatedAt && o.status !== "Served" && o.status !== "Voided";
}

const TABLE_AREAS = ["Ground Floor", "1st Floor", "Basement"] as const;

// An order is fully wrapped up once it's been served AND paid — at that point it no longer
// needs attention from the Till, so it drops out of the active ticket views (still visible
// under the "Served" filter, and in Reports).
function isOrderClosedOut(o: Order) {
  return o.status === "Served" && !!o.paymentMethod;
}

// Groups a cart/order's items by menu category, in the category's own Manage Dishes order, for
// the printed receipt (see lib/escpos-ticket.ts's SunmiTicketCategoryGroup — this is deliberately
// built here rather than inside that module, which stays decoupled from menu data). An item whose
// dish no longer exists (deleted since the order was placed) or that was a free-typed "custom:"
// line falls into a trailing "Other" group rather than being dropped from the receipt.
// Pure cart-total math, pulled out of the render body so it can also run on a captured cart
// snapshot after the live `cart` state has already been reset (see handlePlaceOrder's auto-print
// on payment, which fires after setCart(emptyCart)) — both call sites must agree exactly, since
// this mirrors orderTotal()/orderBreakdown() in lib/types.ts for what actually gets saved.
function computeCartTotals(cart: CartState) {
  const subtotal = cart.items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const extraDiscountRaw =
    cart.extraDiscountMode === "percent" ? subtotal * (Math.max(0, Number(cart.extraDiscount) || 0) / 100) : Number(cart.extraDiscount) || 0;
  const extraDiscountAmount = Math.max(0, Math.min(subtotal, extraDiscountRaw));
  const couponDiscountAmount = cart.appliedCoupon
    ? Math.max(0, Math.min(subtotal - extraDiscountAmount, cart.appliedCoupon.discount))
    : 0;
  const discountedSubtotal = Math.max(0, subtotal - extraDiscountAmount - couponDiscountAmount);
  const rawTax = cart.items.reduce((sum, i) => sum + i.price * i.qty * ((i.taxRate ?? 0) / 100), 0);
  const discountFactor = subtotal > 0 ? discountedSubtotal / subtotal : 0;
  const tax = rawTax * discountFactor;
  const total = discountedSubtotal + tax;
  return { subtotal, extraDiscountAmount, couponDiscountAmount, tax, total };
}

function groupItemsByCategory(items: OrderItem[], dishes: Dish[], categories: Category[]) {
  const dishById = new Map(dishes.map((d) => [d.id, d]));
  const groups = new Map<string, OrderItem[]>();
  for (const item of items) {
    const dish = dishById.get(item.dishId);
    const categoryName = dish ? (categories.find((c) => c.id === dish.categoryId)?.name ?? "Other") : "Other";
    if (!groups.has(categoryName)) groups.set(categoryName, []);
    groups.get(categoryName)!.push(item);
  }
  // Category order follows categories' own configured order; "Other" always trails.
  const ordered = categories.map((c) => c.name).filter((name) => groups.has(name));
  if (groups.has("Other")) ordered.push("Other");
  return ordered.map((categoryName) => ({
    categoryName,
    items: groups.get(categoryName)!.map((i) => ({ name: i.name, qty: i.qty, price: i.price, note: i.note })),
  }));
}

// A tiny top-level wrapper around Date.now() (rather than calling it directly inside the
// component's body) keeps the component itself free of impure calls, per the project's
// react-hooks purity lint rule.
function currentBusinessDateKey(openTime: string | null, timezone: string) {
  return businessDateKey(Date.now(), openTime, timezone);
}

const STATUS_STYLES: Record<Order["status"], string> = {
  Pending: "bg-amber-100 text-amber-800",
  "In Kitchen": "bg-teal-100 text-teal-700",
  "Wait List": "bg-orange-100 text-orange-700",
  Ready: "bg-purple-100 text-purple-700",
  Served: "bg-neutral-100 text-neutral-600",
  Voided: "bg-rose-100 text-rose-700",
};

const CARD_TINTS: Record<Order["status"], string> = {
  Pending: "bg-amber-50 border-amber-200",
  "In Kitchen": "bg-teal-50 border-teal-100",
  "Wait List": "bg-orange-50 border-orange-100",
  Ready: "bg-purple-50 border-purple-100",
  Served: "bg-neutral-50 border-neutral-100",
  Voided: "bg-rose-50 border-rose-100",
};

const CHANNELS: OrderChannel[] = ["Dine in", "Wait List", "Take Away", "Delivery", "Online", "Third Party"];
const THIRD_PARTY_PROVIDERS: ThirdPartyProvider[] = ["Uber Eats", "Deliveroo", "Just Eat", "Other"];

interface CartState {
  editingOrderId: string | null;
  tableId: string | null;
  tableNumber: number | null;
  guests: number;
  channel: OrderChannel;
  thirdPartyProvider: ThirdPartyProvider;
  items: OrderItem[];
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  payments: PaymentLine[];
  cashReceived: string;
  extraDiscount: string;
  // Whether extraDiscount above is a flat currency amount or a percentage of the subtotal — a
  // UI-only distinction; what actually gets saved (and what orders.extraDiscount always was) is
  // the computed flat amount, so an order reopened for editing always starts back in "amount"
  // mode regardless of how the discount was originally entered.
  extraDiscountMode: "amount" | "percent";
  couponCode: string;
  appliedCoupon: { code: string; discount: number } | null;
  loyaltyContact: string;
  loyaltyMember: { id: string; code: string; name: string | null } | null;
  // UI-only: whether staff have picked the order type yet. Until they have, the Order Type picker
  // shows every option; once one's picked it collapses to just that one (with a Change link).
  channelChosen: boolean;
}

const emptyCart: CartState = {
  editingOrderId: null,
  tableId: null,
  tableNumber: null,
  guests: 2,
  channel: "Dine in",
  thirdPartyProvider: "Uber Eats",
  items: [],
  customerName: "",
  customerPhone: "",
  customerAddress: "",
  payments: [],
  cashReceived: "",
  extraDiscount: "",
  extraDiscountMode: "amount",
  couponCode: "",
  appliedCoupon: null,
  loyaltyContact: "",
  loyaltyMember: null,
  channelChosen: false,
};

export function OrderLineClient({
  categories,
  dishes,
  tables,
  orders,
  paymentTerminals,
  currencySymbol,
  restaurantName,
  canDiscount,
  taxEnabled,
  invoiceAddress,
  invoicePhone,
  invoiceEmail,
  invoiceWebsite,
  invoiceLogoUrl,
  invoiceFooterText,
  openTime,
  timezone,
  localPrintTarget,
  staffName,
  hasKitchen,
}: {
  categories: Category[];
  dishes: Dish[];
  tables: RestaurantTable[];
  orders: Order[];
  paymentTerminals: PaymentTerminal[];
  currencySymbol: string;
  restaurantName: string;
  canDiscount: boolean;
  taxEnabled: boolean;
  invoiceAddress?: string;
  invoicePhone?: string;
  invoiceEmail?: string;
  invoiceWebsite?: string;
  invoiceLogoUrl?: string;
  invoiceFooterText: string;
  openTime: string | null;
  timezone: string;
  localPrintTarget: { ip: string; port: number | null } | null;
  staffName?: string;
  hasKitchen: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [placingOrder, setPlacingOrder] = useState(false);

  const [cart, setCart] = useState<CartState>(() => {
    const tableId = searchParams.get("tableId");
    const tableNumber = searchParams.get("tableNumber");
    if (tableId && tableNumber) {
      return { ...emptyCart, tableId, tableNumber: Number(tableNumber), guests: 1, channelChosen: true };
    }
    return emptyCart;
  });

  // Recalling an already-paid order (e.g. from Till History) loads its real payment lines into
  // the cart — this keeps the Payment Method section locked to a read-only summary of what was
  // actually taken instead of showing live, tappable payment buttons on a settled order, until
  // staff explicitly ask to redo it. Reset on every loadOrderIntoCart, since that's the only
  // place a different order (closed-out or not) gets loaded in.
  const [forcePaymentEdit, setForcePaymentEdit] = useState(false);
  const [view, setView] = useState<TillView>("order");
  // Which business day the History view shows — defaults to today, with a filter to look back at
  // a previous day's closed-out/voided orders without the list growing unbounded forever.
  const [historyDateStr, setHistoryDateStr] = useState(() => currentBusinessDateKey(openTime, timezone));
  const [queueTab, setQueueTab] = useState<QueueTab>("All");
  const [tablesArea, setTablesArea] = useState<(typeof TABLE_AREAS)[number]>("Ground Floor");
  const [menuCategory, setMenuCategory] = useState<string>("all");
  const [menuSearch, setMenuSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [noteEditorFor, setNoteEditorFor] = useState<string | null>(null);
  const [customItemModalOpen, setCustomItemModalOpen] = useState(false);
  // Open by default for a brand-new order so Order Type/table selection is the first thing
  // staff see — collapsed when a table was already picked from Manage Table, or when editing.
  const [tableEditorOpen, setTableEditorOpen] = useState(false);
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const [tableActionMode, setTableActionMode] = useState<"swap" | "merge" | null>(null);
  const [tableActionError, setTableActionError] = useState<string | null>(null);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [voidModalOpen, setVoidModalOpen] = useState(false);
  const [shareInvoiceOpen, setShareInvoiceOpen] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [loyaltyError, setLoyaltyError] = useState<string | null>(null);

  // Poll for changes made elsewhere (kitchen marking an order ready, another till voiding
  // one, etc.) so status notifications below stay current without a manual refresh — paused
  // while this tab isn't visible, so a backgrounded tab doesn't keep hitting the server for no
  // one (see useVisibleInterval).
  useVisibleInterval(() => router.refresh(), 10000);

  // Most browsers block audio before the page has seen a user gesture — the first tap anywhere
  // on the Till (adding an item, picking a table, etc.) unlocks it for the rest of the session.
  useEffect(() => {
    const unlock = () => unlockOrderAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  const [notifications, setNotifications] = useState<{ id: string; text: string; status: OrderStatus }[]>([]);
  const knownStatusRef = useRef<Map<string, OrderStatus> | null>(null);

  useEffect(() => {
    const known = knownStatusRef.current;
    if (known) {
      const newlyChanged: { id: string; text: string; status: OrderStatus }[] = [];
      let hasNewOnlineOrder = false;
      let hasNewlyReady = false;
      for (const order of orders) {
        const prevStatus = known.get(order.id);
        if (prevStatus === undefined) {
          // A brand-new order — a customer placing it themselves (website, table QR, kiosk) is the
          // case nobody at the till is already watching for, so that's what gets the alert (a
          // staff-rung-up order is already visible to whoever just rang it up).
          if (order.placedVia !== "staff" && order.status === "Pending") hasNewOnlineOrder = true;
        } else if (prevStatus !== order.status) {
          const where = order.tableNumber ? `Table ${String(order.tableNumber).padStart(2, "0")}` : order.channel;
          newlyChanged.push({
            id: `${order.id}-${order.status}-${Date.now()}`,
            text: `Order #${order.orderNumber} · ${where} is now ${order.status}`,
            status: order.status,
          });
          if (prevStatus !== "Ready" && order.status === "Ready") hasNewlyReady = true;
        }
      }
      if (newlyChanged.length > 0) {
        // Deferred a tick so this doesn't set state synchronously within the effect body.
        setTimeout(() => setNotifications((prev) => [...newlyChanged, ...prev].slice(0, 5)), 0);
        newlyChanged.forEach((n) => {
          setTimeout(() => setNotifications((prev) => prev.filter((x) => x.id !== n.id)), 7000);
        });
      }
      if (hasNewOnlineOrder) playIncomingOrderAlert();
      if (hasNewlyReady) playOrderReadyChime();
    }
    knownStatusRef.current = new Map(orders.map((o) => [o.id, o.status]));
  }, [orders]);

  // A voided order never counts as "closed out" (that needs served + paid), so without this it
  // would sit in the order queue forever. Today's voids stay visible; anything voided from an
  // earlier business day drops off once the restaurant's day rolls over (still in History).
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const dayStart = useMemo(() => businessDayStart(clock, openTime, timezone), [clock, openTime, timezone]);
  // Customer orders waiting to be accepted, oldest first — counted on the red "New Orders" tab and
  // listed on its view, with the alert repeating every 15s until each is accepted or rejected.
  // They only join Open Tickets once accepted.
  const pendingOrders = useMemo(
    () => orders.filter((o) => o.status === "Pending").sort((a, b) => a.createdAt - b.createdAt),
    [orders]
  );
  const hasPending = pendingOrders.length > 0;
  useEffect(() => {
    if (!hasPending) return;
    const id = setInterval(() => playIncomingOrderAlert(), 15000);
    return () => clearInterval(id);
  }, [hasPending]);
  const [handlingId, setHandlingId] = useState<string | null>(null);
  function handleIncoming(order: Order, accept: boolean) {
    if (!accept && !window.confirm(`Reject order #${order.orderNumber}? It won't go to the kitchen.`)) return;
    setHandlingId(order.id);
    startTransition(async () => {
      const result = accept ? await acceptOnlineOrderAction(order.id) : await rejectOnlineOrderAction(order.id);
      setHandlingId(null);
      if (result.error) window.alert(result.error);
      router.refresh();
    });
  }

  const queueOrders = useMemo(
    () => orders.filter((o) => o.status !== "Pending" && !(o.status === "Voided" && o.createdAt < dayStart)),
    [orders, dayStart]
  );

  const filteredOrders = useMemo(() => {
    return queueOrders.filter((o) => {
      if (queueTab === "Served") return o.status === "Served";
      if (isOrderClosedOut(o)) return false;
      if (queueTab === "All") return true;
      if (queueTab === "Dine in") return o.channel === "Dine in";
      if (queueTab === "Wait List") return o.status === "Wait List";
      if (queueTab === "Take Away") return o.channel === "Take Away";
      if (queueTab === "Delivery") return o.channel === "Delivery" || o.channel === "Third Party";
      return true;
    });
  }, [queueOrders, queueTab]);

  const activeOrders = useMemo(() => queueOrders.filter((o) => !isOrderClosedOut(o)), [queueOrders]);

  const queueCounts = useMemo(() => {
    return {
      All: activeOrders.length,
      "Dine in": activeOrders.filter((o) => o.channel === "Dine in").length,
      "Wait List": activeOrders.filter((o) => o.status === "Wait List").length,
      "Take Away": activeOrders.filter((o) => o.channel === "Take Away").length,
      Delivery: activeOrders.filter((o) => o.channel === "Delivery" || o.channel === "Third Party").length,
      Served: orders.filter((o) => o.status === "Served").length,
    } satisfies Record<QueueTab, number>;
  }, [orders, activeOrders]);

  const menuDishes = useMemo(() => {
    const query = menuSearch.trim().toLowerCase();
    return dishes.filter((d) => {
      if (query) return d.name.toLowerCase().includes(query);
      return menuCategory === "all" || d.categoryId === menuCategory;
    });
  }, [dishes, menuCategory, menuSearch]);

  // Fully wrapped-up orders (served+paid) and voided ones from the selected business day, most
  // recent first — reviewing and reprinting past tickets without cluttering active views, or
  // carrying every day's history forward forever once a day's shift is closed. Defaults to
  // today; the History view's own date filter can step back to any earlier day.
  const historyOrders = useMemo(() => {
    const { from, to } = businessDayRange(historyDateStr, openTime, timezone);
    return orders
      .filter((o) => (isOrderClosedOut(o) || o.status === "Voided") && o.createdAt >= from && o.createdAt < to)
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [orders, historyDateStr, openTime, timezone]);

  const priceFor = (dish: Dish) => {
    const key = cart.channel === "Third Party" ? cart.thirdPartyProvider : cart.channel;
    return dish.channelPrices?.[key] ?? dish.price;
  };
  // Snapshotted onto the cart line at add-time (see addToCart) so it survives into the placed
  // order untouched — only relevant while the restaurant has tax turned on at all.
  const taxRateFor = (dish: Dish) => {
    if (!taxEnabled) return 0;
    const category = categories.find((c) => c.id === dish.categoryId);
    return category?.taxRatePercent ?? 0;
  };
  // Summed across every line for that dish — a dish can now sit in the cart as more than one
  // line (see addToCart) once different lines carry different kitchen notes.
  const qtyFor = (dishId: string) => cart.items.filter((i) => i.dishId === dishId).reduce((sum, i) => sum + i.qty, 0);

  const { subtotal, extraDiscountAmount, couponDiscountAmount, tax, total } = computeCartTotals(cart);

  function applyCoupon() {
    const code = cart.couponCode.trim();
    if (!code) return;
    setCouponError(null);
    startTransition(async () => {
      const result = await validateCouponAction(code, Math.max(0, subtotal - extraDiscountAmount));
      if (result.error) {
        setCouponError(result.error);
        setCart((prev) => ({ ...prev, appliedCoupon: null }));
        return;
      }
      setCart((prev) => ({ ...prev, appliedCoupon: { code: result.code!, discount: result.discount! } }));
    });
  }

  function removeCoupon() {
    setCouponError(null);
    setCart((prev) => ({ ...prev, couponCode: "", appliedCoupon: null }));
  }

  // A loyalty code is 7 characters, letters+digits, no "@" — distinct enough from a phone number
  // (all digits/+/-/spaces) or an email to tell apart without asking the user which one they're
  // typing.
  function looksLikeLoyaltyCode(value: string) {
    return /^[A-Z0-9]{5,10}$/i.test(value) && !/^[\d+\-\s]+$/.test(value);
  }

  function findOrEnrollLoyalty() {
    const contact = cart.loyaltyContact.trim();
    if (!contact) return;
    setLoyaltyError(null);
    startTransition(async () => {
      if (looksLikeLoyaltyCode(contact)) {
        const result = await lookupLoyaltyMemberByCodeAction(contact);
        if (result.error || !result.member) {
          setLoyaltyError(result.error ?? "No loyalty member found with that code.");
          return;
        }
        setCart((prev) => ({
          ...prev,
          loyaltyMember: { id: result.member!.id, code: result.member!.code, name: result.member!.name },
        }));
        return;
      }

      const contactType: LoyaltyContactType = contact.includes("@") ? "email" : "phone";
      const result = await lookupOrCreateLoyaltyMemberAction({
        contactType,
        contactValue: contact,
        name: cart.customerName.trim() || undefined,
      });
      if (result.error || !result.member) {
        setLoyaltyError(result.error ?? "Couldn't look up that customer.");
        return;
      }
      setCart((prev) => ({
        ...prev,
        loyaltyMember: { id: result.member!.id, code: result.member!.code, name: result.member!.name },
      }));
    });
  }

  function removeLoyalty() {
    setLoyaltyError(null);
    setCart((prev) => ({ ...prev, loyaltyContact: "", loyaltyMember: null }));
  }

  const editingOrder = cart.editingOrderId ? orders.find((o) => o.id === cart.editingOrderId) : null;
  const paymentLocked = !!editingOrder && isOrderClosedOut(editingOrder) && !forcePaymentEdit;

  // Only merges into an existing line for this dish if that line has no note — a line that
  // already carries a comment (e.g. "no onions") never silently absorbs another tap and becomes
  // "2x" with one shared note. A second, distinctly-commented order of the same dish gets its own
  // line instead, each keeping its own note.
  function addToCart(dish: Dish) {
    if (dish.outOfStock) return;
    setCart((prev) => {
      const existing = prev.items.find((i) => i.dishId === dish.id && !i.note);
      if (existing) {
        return {
          ...prev,
          items: prev.items.map((i) => (i.lineId === existing.lineId ? { ...i, qty: i.qty + 1 } : i)),
        };
      }
      return {
        ...prev,
        items: [
          ...prev.items,
          { dishId: dish.id, name: dish.name, price: priceFor(dish), qty: 1, lineId: crypto.randomUUID(), taxRate: taxRateFor(dish) },
        ],
      };
    });
  }

  // Mirrors addToCart's targeting: shrinks the plain (note-less) line for this dish first, since
  // that's the one the tile's own +/- controls build up; falls back to the last line for the dish
  // only if every line for it already carries a distinct note.
  function decrementCartItem(dishId: string) {
    setCart((prev) => {
      const matches = prev.items.filter((i) => i.dishId === dishId);
      if (matches.length === 0) return prev;
      const target = matches.find((i) => !i.note) ?? matches[matches.length - 1];
      return {
        ...prev,
        items: prev.items
          .map((i) => (i.lineId === target.lineId ? { ...i, qty: i.qty - 1 } : i))
          .filter((i) => i.qty > 0),
      };
    });
  }

  function removeCartItem(lineId: string) {
    setCart((prev) => ({ ...prev, items: prev.items.filter((i) => (i.lineId ?? i.dishId) !== lineId) }));
  }

  function addCustomItem(name: string, price: number, qty: number) {
    setCart((prev) => ({
      ...prev,
      items: [...prev.items, { dishId: `custom:${crypto.randomUUID()}`, name, price, qty, lineId: crypto.randomUUID() }],
    }));
  }

  function updateItemNote(lineId: string, note: string) {
    setCart((prev) => ({
      ...prev,
      items: prev.items.map((i) => ((i.lineId ?? i.dishId) === lineId ? { ...i, note: note || undefined } : i)),
    }));
  }

  function loadOrderIntoCart(order: Order) {
    if (order.status === "Pending") {
      setView("incoming");
      return;
    }
    const orderTotalAmount = orderTotal(order);
    const payments: PaymentLine[] =
      order.payments?.length ? order.payments : order.paymentMethod ? [{ method: order.paymentMethod, amount: orderTotalAmount }] : [];

    setCart({
      channelChosen: true,
      editingOrderId: order.id,
      tableId: order.tableId,
      tableNumber: order.tableNumber,
      guests: order.guests,
      channel: order.channel,
      thirdPartyProvider: order.thirdPartyProvider ?? "Uber Eats",
      // Backfills a lineId for items placed before this existed, so every line in the cart has a
      // stable identity to edit/remove/toggle by regardless of when the order was first placed.
      items: order.items.map((i) => ({ ...i, lineId: i.lineId ?? crypto.randomUUID() })),
      customerName: order.customerName ?? "",
      customerPhone: order.customerPhone ?? "",
      customerAddress: order.customerAddress ?? "",
      payments,
      cashReceived: order.cashReceived ? String(order.cashReceived) : "",
      extraDiscount: order.extraDiscount ? String(order.extraDiscount) : "",
      extraDiscountMode: "amount",
      couponCode: order.couponCode ?? "",
      appliedCoupon: order.couponCode ? { code: order.couponCode, discount: order.couponDiscount ?? 0 } : null,
      loyaltyContact: "",
      loyaltyMember: order.loyaltyMemberId ? { id: order.loyaltyMemberId, code: "", name: null } : null,
    });
    setForcePaymentEdit(false);
    setCouponError(null);
    setLoyaltyError(null);
    setTableEditorOpen(false);
    setMobileCartOpen(true);
    setView("order");
  }

  function activeOrderForTable(table: RestaurantTable) {
    return orders.find(
      (o) =>
        (o.tableId === table.id || o.mergedTableNumbers?.includes(table.number)) &&
        o.status !== "Voided" &&
        !isOrderClosedOut(o)
    );
  }

  // Toggled from a dish tile's corner badge — lets floor staff 86 an item the moment it runs
  // out, without waiting on Manage Dishes or the Kitchen Display to do it.
  function handleToggleStock(dish: Dish) {
    startTransition(async () => {
      await setDishStockAction(dish.id, !dish.outOfStock);
      router.refresh();
    });
  }

  // Frees a table straight from the Tables view — for a walk-in seated but who left before
  // ordering (or a table left occupied after its only order was voided), so staff don't have
  // to jump to Manage Table just to release it.
  // Frees one table, or every occupied/reserved one. An open (unpaid) order isn't touched — it
  // stays in Open Tickets — so staff are warned first when one is still sitting on the table.
  function handleClearTable(table: RestaurantTable) {
    const open = activeOrderForTable(table);
    if (open && !window.confirm(`Table ${table.number} still has open order #${open.orderNumber}. Free the table anyway? The order stays in Tickets.`)) return;
    startTransition(async () => {
      await freeTablesAction([table.id]);
      router.refresh();
    });
  }

  function handleFreeAllTables() {
    const busy = tables.filter((t) => t.status !== "available");
    if (busy.length === 0) return;
    const withOrders = busy.filter((t) => activeOrderForTable(t));
    const warning = withOrders.length
      ? `\n\n${withOrders.length} of them still ${withOrders.length === 1 ? "has an open order" : "have open orders"} (Table ${withOrders.map((t) => t.number).join(", ")}) — those orders stay in Tickets.`
      : "";
    if (!window.confirm(`Free all ${busy.length} occupied/reserved table${busy.length === 1 ? "" : "s"} in every area?${warning}`)) return;
    startTransition(async () => {
      await freeTablesAction();
      router.refresh();
    });
  }

  function handleTableSelect(table: RestaurantTable) {
    const existing = activeOrderForTable(table);
    if (existing) {
      loadOrderIntoCart(existing);
      return;
    }
    setCart({ ...emptyCart, tableId: table.id, tableNumber: table.number, channel: "Dine in", channelChosen: true });
    setTableEditorOpen(false);
    setMobileCartOpen(true);
    setView("order");
  }

  const paymentsTotal = cart.payments.reduce((sum, p) => sum + p.amount, 0);
  const paymentsRemaining = total - paymentsTotal;
  const isFullyPaid = cart.items.length > 0 && Math.abs(paymentsRemaining) < 0.01;
  const cashLine = cart.payments.find((p) => p.method === "Cash");
  const cashReceivedAmount = Number(cart.cashReceived) || 0;
  const changeDue = cashLine && cashReceivedAmount > cashLine.amount ? cashReceivedAmount - cashLine.amount : 0;

  function handlePlaceOrder() {
    // Guard against double/triple-tapping the button (or a slow network making someone tap
    // again before it visibly responds) firing this twice and creating duplicate orders.
    if (cart.items.length === 0 || placingOrder) return;
    setPlacingOrder(true);
    // Captured now, before setCart(emptyCart) below wipes the cart this receipt is for — a
    // payment-included order auto-prints right after placement (see printReceiptLocally), and by
    // then React may already have cleared cart state.
    const wasPaid = cart.payments.length > 0;
    const receiptCart = cart;
    startTransition(async () => {
      try {
        const result = await placeOrderAction({
          editingOrderId: cart.editingOrderId,
          tableId: cart.tableId,
          tableNumber: cart.tableNumber,
          guests: cart.guests,
          channel: cart.channel,
          thirdPartyProvider: cart.channel === "Third Party" ? cart.thirdPartyProvider : undefined,
          items: cart.items,
          payments: cart.payments,
          cashReceived: cashLine ? cashReceivedAmount || undefined : undefined,
          extraDiscount: extraDiscountAmount || undefined,
          couponCode: cart.appliedCoupon?.code,
          loyaltyMemberId: cart.loyaltyMember?.id,
          customerName: cart.customerName.trim() || undefined,
          customerPhone: cart.customerPhone.trim() || undefined,
          customerAddress: cart.customerAddress.trim() || undefined,
        });
        setCart(emptyCart);
        setCouponError(null);
        setLoyaltyError(null);
        setTableEditorOpen(false);
        setMobileCartOpen(false);
        router.refresh();

        // Auto-print on payment, not on a plain send-to-kitchen — an order placed with no
        // payment lines is still awaiting payment at the till later, so nothing should print
        // until that actually happens (same order, re-placed with payments added, fires this
        // same branch at that point). Silent/best-effort: never blocks the Till UI either way.
        if (wasPaid && result && localPrintTarget) {
          printReceiptLocally(receiptCart, result.orderNumber, Date.now(), result.id).catch((err) =>
            console.warn("Auto-print on payment failed.", err)
          );
        }
      } finally {
        setPlacingOrder(false);
      }
    });
  }

  function handleAdvanceStatus(next: OrderStatus) {
    if (!cart.editingOrderId) return;
    startTransition(async () => {
      await setOrderStatusAction(cart.editingOrderId!, next);
      router.refresh();
    });
  }

  function handleVoid(reason: string) {
    if (!cart.editingOrderId) return;
    const id = cart.editingOrderId;
    setVoidModalOpen(false);
    startTransition(async () => {
      await voidOrderAction(id, reason);
      router.refresh();
    });
    setCart(emptyCart);
    setMobileCartOpen(false);
  }

  function handleTableAction(table: RestaurantTable) {
    if (!cart.editingOrderId || !tableActionMode) return;
    const orderId = cart.editingOrderId;
    const mode = tableActionMode;
    startTransition(async () => {
      const result =
        mode === "swap" ? await swapOrderTableAction(orderId, table.id) : await mergeTableIntoOrderAction(orderId, table.id);
      if (result.error) {
        setTableActionError(result.error);
        return;
      }
      if (result.order) {
        setCart((prev) => ({
          ...prev,
          tableId: result.order!.tableId,
          tableNumber: result.order!.tableNumber,
          guests: result.order!.guests,
          items: result.order!.items,
        }));
      }
      setTableActionMode(null);
      setTableActionError(null);
      router.refresh();
    });
  }

  // Builds the ESC/POS receipt for `receiptCart` and sends it to the local print bridge (native
  // Android bridge from the APK, or the HTTP one — see lib/local-print-bridge.ts) — the one and
  // only print path once a restaurant has local printing configured. Used both by the manual
  // Print button below and by handlePlaceOrder's auto-print on payment.
  async function printReceiptLocally(receiptCart: CartState, orderNumber: string, createdAt: number, orderId: string | null) {
    if (!localPrintTarget) return;
    const totals = computeCartTotals(receiptCart);
    const { hex } = await buildTicketEscPosAction({
      restaurantName,
      invoiceLogoUrl,
      invoiceAddress,
      invoicePhone,
      invoiceEmail,
      invoiceWebsite,
      orderNumber,
      createdAt,
      channel: receiptCart.channel,
      tableNumber: receiptCart.tableNumber,
      guests: receiptCart.tableNumber ? receiptCart.guests : null,
      staffName,
      items: groupItemsByCategory(receiptCart.items, dishes, categories),
      customerName: receiptCart.customerName || undefined,
      customerPhone: receiptCart.customerPhone || undefined,
      customerAddress: receiptCart.customerAddress || undefined,
      subtotal: totals.subtotal,
      extraDiscount: totals.extraDiscountAmount || undefined,
      couponCode: receiptCart.appliedCoupon?.code,
      couponDiscount: totals.couponDiscountAmount || undefined,
      tax: totals.tax,
      total: totals.total,
      currencySymbol,
      payments: receiptCart.payments.length > 0 ? receiptCart.payments : undefined,
      footerText: invoiceFooterText,
      invoiceUrl: orderId ? `${window.location.origin}/invoice/${orderId}` : undefined,
    });
    await printViaLocalBridge({ printerIp: localPrintTarget.ip, printerPort: localPrintTarget.port, escposHex: hex });
  }

  // The web-print popup (lib/print-ticket.ts) is now only a fallback for a restaurant that
  // hasn't set up local printing at all — once localPrintTarget exists, this is the only path,
  // per the explicit instruction that staff shouldn't see the old browser print dialog anymore.
  function handlePrint() {
    if (localPrintTarget) {
      printReceiptLocally(cart, editingOrder?.orderNumber ?? "NEW", editingOrder?.createdAt ?? Date.now(), cart.editingOrderId).catch(
        (err) => console.warn("Local print failed.", err)
      );
      return;
    }
    printTicket({
      orderNumber: editingOrder?.orderNumber ?? "NEW",
      createdAt: editingOrder?.createdAt ?? Date.now(),
      invoiceUrl: cart.editingOrderId ? `${window.location.origin}/invoice/${cart.editingOrderId}` : undefined,
      tableNumber: cart.tableNumber,
      channel: cart.channel,
      items: cart.items,
      subtotal,
      tax,
      extraDiscount: extraDiscountAmount || undefined,
      couponCode: cart.appliedCoupon?.code,
      couponDiscount: couponDiscountAmount || undefined,
      total,
      currencySymbol,
      customerName: cart.customerName || undefined,
      customerPhone: cart.customerPhone || undefined,
      customerAddress: cart.channel === "Delivery" ? cart.customerAddress || undefined : undefined,
      payments: cart.payments.length > 1 ? cart.payments : undefined,
      cashReceived: cashLine ? cashReceivedAmount || undefined : undefined,
      changeDue: changeDue || undefined,
      restaurantName,
      invoiceAddress,
      invoicePhone,
      invoiceWebsite,
      invoiceLogoUrl,
      invoiceFooterText,
    });
  }

  const cartPanelProps = {
    cart,
    setCart,
    editingOrder,
    paymentLocked,
    onUnlockPayment: () => setForcePaymentEdit(true),
    tableEditorOpen,
    setTableEditorOpen,
    tablePickerOpen,
    setTablePickerOpen,
    tables,
    subtotal,
    tax,
    canDiscount,
    extraDiscountAmount,
    couponDiscountAmount,
    couponError,
    applyCoupon,
    removeCoupon,
    loyaltyError,
    findOrEnrollLoyalty,
    removeLoyalty,
    total,
    paymentsTotal,
    paymentsRemaining,
    isFullyPaid,
    changeDue,
    paymentTerminals,
    currencySymbol,
    removeCartItem,
    noteEditorFor,
    setNoteEditorFor,
    updateItemNote,
    onAddCustomItem: () => setCustomItemModalOpen(true),
    handlePlaceOrder,
    placingOrder,
    handleAdvanceStatus,
    handlePrint,
    onSwapTableClick: () => {
      setTableActionError(null);
      setTableActionMode("swap");
    },
    onMergeTableClick: () => {
      setTableActionError(null);
      setTableActionMode("merge");
    },
    onVoidClick: () => setVoidModalOpen(true),
    onShareInvoiceClick: () => setShareInvoiceOpen(true),
    onClose: () => setMobileCartOpen(false),
    hasKitchen,
  };

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* Order status notifications */}
      {notifications.length > 0 && (
        <div className="pointer-events-none fixed right-4 top-4 z-[60] flex w-72 flex-col gap-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`pointer-events-auto flex items-start gap-2 rounded-xl border px-3.5 py-3 text-sm shadow-lg ${CARD_TINTS[n.status]}`}
            >
              {n.status === "Served" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" />
              ) : (
                <Bell className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" />
              )}
              <span className="text-neutral-700">{n.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Main column — header, toolbars and the category row stay put; only the grid below
          them scrolls (each view wraps its content in its own scroll box). */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col px-6 pt-6 lg:pb-6">
        <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
          {view === "order" && (
            <button
              onClick={() => {
                setCart(emptyCart);
                setTableEditorOpen(false);
                setMobileCartOpen(false);
              }}
              title="New order"
              aria-label="New order"
              className="flex min-h-11 min-w-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-[var(--brand)] px-3 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] 2xl:gap-2 2xl:px-5 2xl:text-base [&>svg]:size-5"
            >
              <Plus className="h-3.5 w-3.5" /> <span className="hidden xl:inline 2xl:hidden">New</span>
              <span className="hidden 2xl:inline">New Order</span>
            </button>
          )}
          <div className="flex items-center gap-1 rounded-2xl border border-neutral-200 bg-white p-1">
            <TopViewTab
              active={view === "order"}
              icon={ShoppingBag}
              label="Order"
              onClick={() => setView("order")}
            />
            <NewOrdersTab active={view === "incoming"} count={pendingOrders.length} onClick={() => setView("incoming")} />
            <TopViewTab
              active={view === "tickets"}
              icon={ClipboardList}
              label="Open Tickets"
              shortLabel="Tickets"
              count={queueCounts.All}
              onClick={() => setView("tickets")}
            />
            <TopViewTab
              active={view === "tables"}
              icon={LayoutGrid}
              label="Tables"
              onClick={() => setView("tables")}
            />
            <TopViewTab
              active={view === "history"}
              icon={History}
              label="History"
              onClick={() => setView("history")}
            />
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <SoundSettingsButton className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-2.5 py-2.5 text-sm font-medium text-neutral-500 hover:bg-neutral-50 2xl:text-base [&>svg]:size-5" />
            <FullscreenButton className="hidden min-h-11 min-w-11 items-center xl:flex justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-2.5 py-2.5 text-sm font-medium text-neutral-500 hover:bg-neutral-50 2xl:text-base [&>svg]:size-5" />
            <button
              onClick={() => window.location.reload()}
              title="Refresh — reloads the page and clears any cached data"
              className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-2.5 py-2.5 text-sm font-medium text-neutral-500 hover:bg-neutral-50 2xl:text-base [&>svg]:size-5"
            >
              <RefreshCw className="h-4 w-4" /> <span className="hidden 2xl:inline">Refresh</span>
            </button>
          </div>
        </div>

        {view === "incoming" && (
          <IncomingOrdersView
            orders={pendingOrders}
            currencySymbol={currencySymbol}
            handlingId={handlingId}
            onAccept={(o) => handleIncoming(o, true)}
            onReject={(o) => handleIncoming(o, false)}
          />
        )}

        {view === "order" && (
          <>
            {/* One row: a fixed Search tile, then the categories swiped sideways. Tapping Search
                turns the row into the search box (categories don't apply while searching), so
                search doesn't need a row of its own above the dish box. */}
            {searchOpen || menuSearch ? (
              <div className="mb-3 flex min-h-[76px] shrink-0 items-center gap-3 2xl:min-h-[92px]">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400" />
                  <input
                    autoFocus
                    value={menuSearch}
                    onChange={(e) => setMenuSearch(e.target.value)}
                    placeholder="Search dishes…"
                    className="w-full rounded-2xl border border-[var(--brand)] bg-white py-4 pl-12 pr-4 text-lg outline-none"
                  />
                </div>
                {menuSearch && (
                  <span className="shrink-0 text-sm text-neutral-400">
                    {menuDishes.length} result{menuDishes.length === 1 ? "" : "s"}
                  </span>
                )}
                <button
                  onClick={() => {
                    setMenuSearch("");
                    setSearchOpen(false);
                  }}
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50 [&>svg]:size-6"
                  aria-label="Close search"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <div className="mb-3 flex shrink-0 gap-2.5">
                <button
                  onClick={() => setSearchOpen(true)}
                  className="flex min-h-[76px] w-[76px] shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-neutral-300 bg-white text-neutral-500 hover:bg-neutral-50 active:scale-[0.97] 2xl:min-h-[92px] 2xl:w-[92px] [&>svg]:size-6"
                >
                  <Search className="h-5 w-5" />
                  <span className="text-xs font-semibold">Search</span>
                </button>
                <div className="-mr-1 flex min-w-0 flex-1 snap-x gap-2.5 overflow-x-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,black_88%,transparent)]">
                  <CategoryBox active={menuCategory === "all"} label="All Menu" icon="all" onClick={() => setMenuCategory("all")} />
                  {categories.map((c) => (
                    <CategoryBox key={c.id} active={menuCategory === c.id} label={c.name} icon={c.icon} onClick={() => setMenuCategory(c.id)} />
                  ))}
                </div>
              </div>
            )}

            {/* Dish grid — its own box; the only part of the order view that scrolls. */}
            <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-neutral-200 bg-neutral-100/70 p-2.5 pb-24 lg:pb-2.5 2xl:p-3">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-2.5 2xl:grid-cols-[repeat(auto-fill,minmax(168px,1fr))] 2xl:gap-3">
              {menuDishes.map((dish) => {
                const qty = qtyFor(dish.id);
                const price = priceFor(dish);
                return (
                  <div
                    key={dish.id}
                    role="button"
                    tabIndex={dish.outOfStock ? -1 : 0}
                    aria-disabled={dish.outOfStock}
                    onClick={() => !dish.outOfStock && addToCart(dish)}
                    onKeyDown={(e) => {
                      if (!dish.outOfStock && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        addToCart(dish);
                      }
                    }}
                    className={`relative flex min-w-0 select-none flex-col rounded-xl border bg-white p-2.5 shadow-sm transition 2xl:p-3 ${
                      dish.outOfStock ? "cursor-not-allowed" : "cursor-pointer active:scale-[0.98]"
                    } ${
                      dish.outOfStock
                        ? "border-neutral-200 opacity-60"
                        : qty > 0
                          ? "border-[var(--brand)] ring-1 ring-[var(--brand)] hover:shadow-md"
                          : "border-neutral-200 hover:shadow-md"
                    }`}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleStock(dish);
                      }}
                      title={dish.outOfStock ? "Mark back in stock" : "Mark out of stock"}
                      className={`absolute right-1.5 top-1.5 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white shadow-sm [&>svg]:size-4 ${
                        dish.outOfStock ? "bg-rose-500 text-white hover:bg-rose-600" : "bg-white text-neutral-300 hover:text-rose-500"
                      }`}
                    >
                      <Ban className="h-3.5 w-3.5" />
                    </button>
                    {dish.imageUrl ? (
                      <img
                        src={dish.imageUrl}
                        alt={dish.name}
                        className={`mb-1.5 h-12 w-12 rounded-lg object-cover 2xl:h-14 2xl:w-14 ${dish.outOfStock ? "grayscale" : ""}`}
                      />
                    ) : (
                      <div
                        className={`mb-1.5 flex h-12 w-12 items-center justify-center rounded-full text-2xl 2xl:h-14 2xl:w-14 2xl:text-3xl ${dish.outOfStock ? "grayscale" : ""}`}
                        style={{ backgroundColor: dish.color }}
                      >
                        {dish.emoji}
                      </div>
                    )}
                    <div className="truncate text-[11px] text-neutral-400">
                      {categories.find((c) => c.id === dish.categoryId)?.name}
                    </div>
                    <div className="mb-1 line-clamp-2 break-words text-sm font-semibold leading-snug text-neutral-900 2xl:text-[15px]">{dish.name}</div>
                    <div className="mt-auto">
                      <div className="mb-1.5 text-[15px] font-semibold text-neutral-800">
                        {formatMoney(price, currencySymbol)}
                        {price !== dish.price && <span className="ml-1 text-[10px] font-normal text-teal-600">({cart.channel})</span>}
                      </div>
                      {dish.outOfStock ? (
                        <span className="inline-block rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">Sold Out</span>
                      ) : (
                        <div className="flex items-center justify-between gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              decrementCartItem(dish.id);
                            }}
                            disabled={qty === 0}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-200 text-neutral-500 hover:bg-neutral-50 active:scale-95 disabled:opacity-30 2xl:h-11 2xl:w-11 [&>svg]:size-5"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="min-w-6 text-center text-base font-semibold text-neutral-800">{qty}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              addToCart(dish);
                            }}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-white hover:bg-[var(--brand-dark)] active:scale-95 2xl:h-11 2xl:w-11 [&>svg]:size-5"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {menuDishes.length === 0 && (
                <div className="col-span-full py-16 text-center text-sm text-neutral-400">No dishes in this category.</div>
              )}
            </div>
            </div>
          </>
        )}

        {view === "tickets" && (
          <>
            {/* Channel/status filter chips — one row, swiped sideways */}
            <div className="-mx-1 mb-4 flex shrink-0 items-center gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
              {QUEUE_TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setQueueTab(tab)}
                  className={`flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-5 py-2.5 text-sm font-medium transition-colors 2xl:text-base ${
                    queueTab === tab
                      ? "border-[var(--brand)] bg-[var(--brand)] text-white"
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

            {/* Open tickets grid */}
            <div className="min-h-0 flex-1 overflow-y-auto pb-24 lg:pb-0">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-4">
              {filteredOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  selected={cart.editingOrderId === order.id}
                  onClick={() => loadOrderIntoCart(order)}
                />
              ))}
              {filteredOrders.length === 0 && (
                <div className="col-span-full flex h-32 items-center justify-center text-sm text-neutral-400">
                  No open tickets in this view.
                </div>
              )}
            </div>
            </div>
          </>
        )}

        {view === "tables" && (
          <TablesOverview
            tables={tables}
            orders={orders}
            area={tablesArea}
            setArea={setTablesArea}
            cartTableId={cart.tableId}
            onSelect={handleTableSelect}
            onClear={handleClearTable}
            onClearAll={handleFreeAllTables}
          />
        )}

        {view === "history" && (
          <>
            <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-neutral-500">
                Completed and voided orders, most recent first — tap one to review or reprint it.
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setHistoryDateStr((d) => shiftDateKey(d, -1))}
                  className="flex h-11 w-11 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50 [&>svg]:size-5"
                  aria-label="Previous day"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <input
                  type="date"
                  value={historyDateStr}
                  onChange={(e) => setHistoryDateStr(e.target.value)}
                  className="rounded-lg border border-neutral-200 px-3 py-2.5 text-base outline-none focus:border-[var(--brand)]"
                />
                <button
                  onClick={() => setHistoryDateStr((d) => shiftDateKey(d, 1))}
                  className="flex h-11 w-11 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50 [&>svg]:size-5"
                  aria-label="Next day"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                {historyDateStr !== currentBusinessDateKey(openTime, timezone) && (
                  <button
                    onClick={() => setHistoryDateStr(currentBusinessDateKey(openTime, timezone))}
                    className="min-h-11 rounded-lg px-3.5 py-2.5 text-sm font-semibold text-teal-600 hover:bg-teal-50"
                  >
                    Today
                  </button>
                )}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pb-24 lg:pb-0">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-4">
              {historyOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  selected={cart.editingOrderId === order.id}
                  onClick={() => loadOrderIntoCart(order)}
                />
              ))}
              {historyOrders.length === 0 && (
                <div className="col-span-full flex h-32 items-center justify-center text-sm text-neutral-400">
                  No completed or voided orders on this date.
                </div>
              )}
            </div>
            </div>
          </>
        )}
      </div>

      {/* Desktop cart panel — same light theme as the menu area, just a border to separate it. */}
      <div className="hidden w-[380px] shrink-0 xl:w-[400px] flex-col overflow-hidden border-l border-neutral-200 bg-white p-5 lg:flex min-h-0 2xl:w-[460px]">
        <CartPanel {...cartPanelProps} showClose={false} />
      </div>

      {/* Mobile / handheld floating cart button */}
      {!mobileCartOpen && (
        <button
          onClick={() => setMobileCartOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-[var(--brand)] px-5 py-3.5 text-sm font-semibold text-white shadow-lg lg:hidden"
        >
          <ShoppingBag className="h-4 w-4" />
          {cart.items.reduce((s, i) => s + i.qty, 0)} · {formatMoney(total, currencySymbol)}
        </button>
      )}

      {/* Mobile cart drawer */}
      {mobileCartOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white p-5 lg:hidden">
          <CartPanel {...cartPanelProps} showClose />
        </div>
      )}

      {voidModalOpen && <VoidModal onCancel={() => setVoidModalOpen(false)} onConfirm={handleVoid} />}
      {shareInvoiceOpen && cart.editingOrderId && (
        <ShareInvoiceModal orderId={cart.editingOrderId} onClose={() => setShareInvoiceOpen(false)} />
      )}
      {customItemModalOpen && (
        <CustomItemModal
          onClose={() => setCustomItemModalOpen(false)}
          onSave={(name, price, qty) => {
            addCustomItem(name, price, qty);
            setCustomItemModalOpen(false);
          }}
        />
      )}
      {tableActionMode && (
        <TableLayoutPicker
          tables={tables}
          selectedTableId={cart.tableId}
          allowOccupied={tableActionMode === "merge"}
          title={tableActionMode === "merge" ? "Merge Which Table In?" : "Move Order To…"}
          onSelect={handleTableAction}
          onClose={() => {
            setTableActionMode(null);
            setTableActionError(null);
          }}
        />
      )}
      {tableActionError && (
        <div className="fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4 lg:bottom-6">
          <div className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
            {tableActionError}
            <button onClick={() => setTableActionError(null)} className="text-white/80 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface CartPanelProps {
  cart: CartState;
  setCart: React.Dispatch<React.SetStateAction<CartState>>;
  editingOrder: Order | null | undefined;
  paymentLocked: boolean;
  onUnlockPayment: () => void;
  tableEditorOpen: boolean;
  setTableEditorOpen: (v: boolean | ((v: boolean) => boolean)) => void;
  tablePickerOpen: boolean;
  setTablePickerOpen: (v: boolean) => void;
  tables: RestaurantTable[];
  subtotal: number;
  tax: number;
  canDiscount: boolean;
  extraDiscountAmount: number;
  couponDiscountAmount: number;
  couponError: string | null;
  applyCoupon: () => void;
  removeCoupon: () => void;
  loyaltyError: string | null;
  findOrEnrollLoyalty: () => void;
  removeLoyalty: () => void;
  total: number;
  paymentsTotal: number;
  paymentsRemaining: number;
  isFullyPaid: boolean;
  changeDue: number;
  paymentTerminals: PaymentTerminal[];
  currencySymbol: string;
  removeCartItem: (id: string) => void;
  noteEditorFor: string | null;
  setNoteEditorFor: (v: string | null) => void;
  updateItemNote: (lineId: string, note: string) => void;
  onAddCustomItem: () => void;
  handlePlaceOrder: () => void;
  placingOrder: boolean;
  handleAdvanceStatus: (next: OrderStatus) => void;
  handlePrint: () => void;
  onSwapTableClick: () => void;
  onMergeTableClick: () => void;
  onVoidClick: () => void;
  onShareInvoiceClick: () => void;
  onClose: () => void;
  showClose: boolean;
  hasKitchen: boolean;
}

function CartPanel({
  cart,
  setCart,
  editingOrder,
  paymentLocked,
  onUnlockPayment,
  tableEditorOpen,
  setTableEditorOpen,
  tablePickerOpen,
  setTablePickerOpen,
  tables,
  subtotal,
  tax,
  canDiscount,
  extraDiscountAmount,
  couponDiscountAmount,
  couponError,
  applyCoupon,
  removeCoupon,
  loyaltyError,
  findOrEnrollLoyalty,
  removeLoyalty,
  total,
  paymentsTotal,
  paymentsRemaining,
  isFullyPaid,
  changeDue,
  paymentTerminals,
  currencySymbol,
  removeCartItem,
  noteEditorFor,
  setNoteEditorFor,
  updateItemNote,
  onAddCustomItem,
  handlePlaceOrder,
  placingOrder,
  handleAdvanceStatus,
  handlePrint,
  onSwapTableClick,
  onMergeTableClick,
  onVoidClick,
  onShareInvoiceClick,
  onClose,
  showClose,
  hasKitchen,
}: CartPanelProps) {
  const canManageTable = !!cart.editingOrderId && !!cart.tableId && editingOrder?.status !== "Voided";
  const [sumupCharging, setSumupCharging] = useState<{ terminal: PaymentTerminal; amount: number } | null>(null);
  const [teyaCharging, setTeyaCharging] = useState<{ terminal: PaymentTerminal; amount: number } | null>(null);
  // The Order Type picker shows every option until one's been picked for this order, then just
  // that one (Change reopens the full list). Discounts & Loyalty start collapsed.
  const [extrasOpen, setExtrasOpen] = useState(false);
  const discountTotal = couponDiscountAmount + extraDiscountAmount;
  const setupSummary =
    cart.channel === "Dine in" || cart.channel === "Wait List"
      ? `${cart.tableNumber ? `Table ${String(cart.tableNumber).padStart(2, "0")}` : "Choose table"} · ${cart.guests} ${cart.guests === 1 ? "guest" : "guests"}`
      : cart.channel === "Take Away" || cart.channel === "Delivery"
        ? [cart.customerName || "Add customer", cart.customerPhone].filter(Boolean).join(" · ")
        : cart.channel === "Third Party"
          ? cart.thirdPartyProvider
          : "";

  function updatePaymentAmount(method: string, amount: number) {
    setCart((prev) => ({
      ...prev,
      payments: prev.payments.map((p) => (p.method === method ? { ...p, amount } : p)),
    }));
  }

  function removePaymentLine(method: string) {
    setCart((prev) => ({ ...prev, payments: prev.payments.filter((p) => p.method !== method) }));
  }

  function remainingAmount() {
    const applied = cart.payments.reduce((s, p) => s + p.amount, 0);
    return Math.max(0, Math.round((total - applied) * 100) / 100);
  }

  function togglePaymentLine(method: string) {
    setCart((prev) => {
      if (prev.payments.some((p) => p.method === method)) {
        return { ...prev, payments: prev.payments.filter((p) => p.method !== method) };
      }
      const applied = prev.payments.reduce((s, p) => s + p.amount, 0);
      const remaining = Math.max(0, Math.round((total - applied) * 100) / 100);
      return { ...prev, payments: [...prev.payments, { method, amount: remaining }] };
    });
  }

  // A SumUp-paired terminal charges the reader directly instead of just logging a manually-typed
  // amount — tapping it opens the "waiting for card" overlay rather than toggling the payment
  // line immediately; the line only gets added once SumUp confirms the charge succeeded.
  function tapTerminal(t: PaymentTerminal) {
    if (cart.payments.some((p) => p.method === t.name)) {
      removePaymentLine(t.name);
      return;
    }
    if (t.provider === "sumup" && t.sumupReaderId) {
      setSumupCharging({ terminal: t, amount: remainingAmount() });
      return;
    }
    if (t.provider === "teya" && t.teyaTerminalId) {
      setTeyaCharging({ terminal: t, amount: remainingAmount() });
      return;
    }
    togglePaymentLine(t.name);
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-4 flex shrink-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex min-w-0 items-center gap-2 text-lg font-semibold text-neutral-900">
            <span className="truncate">
            {cart.tableNumber
              ? `Table No #${String(cart.tableNumber).padStart(2, "0")}${
                  editingOrder?.mergedTableNumbers?.length
                    ? ` + ${editingOrder.mergedTableNumbers.map((n) => String(n).padStart(2, "0")).join(" + ")}`
                    : ""
                }`
              : cart.customerName
                ? `${cart.channel} · ${cart.customerName}`
                : `${cart.channel} Order`}
            </span>
            {cart.channel === "Delivery" && <Bike className="h-4 w-4 text-blue-500" />}
            {cart.channel === "Take Away" && <ShoppingBag className="h-4 w-4 text-amber-500" />}
          </h2>
          <p className="mt-0.5 truncate text-sm text-neutral-400">
            {cart.editingOrderId && editingOrder
              ? `Order #${editingOrder.orderNumber} · Seq ${orderSequence(editingOrder.orderNumber)} · ${formatOrderTimestamp(editingOrder.createdAt)}`
              : "New Order"}
            {cart.channel === "Dine in" || cart.channel === "Wait List" ? (
              <>
                {" · "}
                {cart.guests} {cart.guests === 1 ? "Person" : "People"}
              </>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 2xl:gap-1.5">
          {canManageTable && (
            <>
              <button
                onClick={onSwapTableClick}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-200 text-neutral-400 xl:h-10 xl:w-10 2xl:h-11 2xl:w-11 [&>svg]:size-5 hover:bg-neutral-50 hover:text-teal-600"
                title="Move to a different table"
              >
                <ArrowLeftRight className="h-4 w-4" />
              </button>
              <button
                onClick={onMergeTableClick}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-200 text-neutral-400 xl:h-10 xl:w-10 2xl:h-11 2xl:w-11 [&>svg]:size-5 hover:bg-neutral-50 hover:text-teal-600"
                title="Merge another table into this order"
              >
                <Combine className="h-4 w-4" />
              </button>
            </>
          )}
          <button
            onClick={handlePrint}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-200 text-neutral-400 xl:h-10 xl:w-10 2xl:h-11 2xl:w-11 [&>svg]:size-5 hover:bg-neutral-50 hover:text-teal-600"
            title="Print ticket"
          >
            <Printer className="h-4 w-4" />
          </button>
          {cart.editingOrderId && (
            <button
              onClick={onShareInvoiceClick}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-200 text-neutral-400 xl:h-10 xl:w-10 2xl:h-11 2xl:w-11 [&>svg]:size-5 hover:bg-neutral-50 hover:text-teal-600"
              title="Share invoice QR"
            >
              <QrCode className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => {
              setCart(emptyCart);
              setTableEditorOpen(false);
            }}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-200 text-neutral-400 xl:h-10 xl:w-10 2xl:h-11 2xl:w-11 [&>svg]:size-5 hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          {showClose && (
            <button
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-200 text-neutral-400 xl:h-10 xl:w-10 2xl:h-11 2xl:w-11 [&>svg]:size-5 hover:bg-neutral-50"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Fixed layout: setup box (collapses to a summary once done), the order tray scrolls on its
          own, and discounts/totals/payment/the main button stay pinned at the bottom. */}
      <div className={`mb-3 flex flex-col gap-2 ${tableEditorOpen ? "min-h-0 shrink" : "shrink-0"}`}>
        {/* Order Type — always visible as one swipe row; picking one doesn't open anything. */}
        <div className="flex shrink-0 gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,black_88%,transparent)]">
          {CHANNELS.map((c) => (
            <button
              key={c}
              onClick={() => setCart((prev) => ({ ...prev, channel: c, channelChosen: true }))}
              className={`min-h-11 shrink-0 whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-semibold ${
                cart.channel === c ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-neutral-200 bg-white text-neutral-500"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Table & guests (or customer details) stay closed until tapped. */}
        {cart.channel !== "Online" &&
          (tableEditorOpen ? (
            <div className="max-h-72 min-h-0 space-y-2.5 overflow-y-auto rounded-xl border border-neutral-200 bg-neutral-50 p-2.5 [scrollbar-width:none] 2xl:max-h-96">
            {(cart.channel === "Dine in" || cart.channel === "Wait List") && (
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <label className="mb-1 block text-xs font-medium text-neutral-500">Table</label>
                  <button
                    onClick={() => setTablePickerOpen(true)}
                    className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left text-base text-neutral-700 hover:border-teal-400 [&>svg]:size-5"
                  >
                    {cart.tableNumber ? (
                      <span className="font-medium">Table {String(cart.tableNumber).padStart(2, "0")}</span>
                    ) : (
                      <span className="truncate text-neutral-400">Pick table</span>
                    )}
                    <LayoutGrid className="h-4 w-4 text-neutral-400" />
                  </button>
                </div>
                <div className="shrink-0">
                  <label className="mb-1 block text-xs font-medium text-neutral-500">Guests</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCart((prev) => ({ ...prev, guests: Math.max(1, prev.guests - 1) }))}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50 active:scale-95"
                    >
                      <Minus className="h-5 w-5" />
                    </button>
                    <div className="flex h-11 w-9 items-center justify-center text-xl font-semibold text-neutral-900">
                      {cart.guests}
                    </div>
                    <button
                      type="button"
                      onClick={() => setCart((prev) => ({ ...prev, guests: prev.guests + 1 }))}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--brand)] text-white hover:bg-[var(--brand-dark)] active:scale-95"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {(cart.channel === "Take Away" || cart.channel === "Delivery") && (
              <>
                <div>
                  <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-neutral-500">
                    <User className="h-3.5 w-3.5" /> Customer Name
                  </label>
                  <input
                    value={cart.customerName}
                    onChange={(e) => setCart((prev) => ({ ...prev, customerName: e.target.value }))}
                    placeholder="e.g. Sarah"
                    className="w-full rounded-lg border border-neutral-200 px-3.5 py-2.5 text-base outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-neutral-500">
                    <Phone className="h-3.5 w-3.5" /> Phone
                  </label>
                  <input
                    value={cart.customerPhone}
                    onChange={(e) => setCart((prev) => ({ ...prev, customerPhone: e.target.value }))}
                    placeholder="+44 7000 000000"
                    className="w-full rounded-lg border border-neutral-200 px-3.5 py-2.5 text-base outline-none focus:border-teal-500"
                  />
                </div>
              </>
            )}

            {cart.channel === "Delivery" && (
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-neutral-500">
                  <MapPin className="h-3.5 w-3.5" /> Delivery Address
                </label>
                <textarea
                  value={cart.customerAddress}
                  onChange={(e) => setCart((prev) => ({ ...prev, customerAddress: e.target.value }))}
                  rows={2}
                  placeholder="Flat, street, postcode…"
                  className="w-full resize-none rounded-lg border border-neutral-200 px-3.5 py-2.5 text-base outline-none focus:border-teal-500"
                />
              </div>
            )}

            {cart.channel === "Third Party" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-500">Provider</label>
                <select
                  value={cart.thirdPartyProvider}
                  onChange={(e) =>
                    setCart((prev) => ({ ...prev, thirdPartyProvider: e.target.value as ThirdPartyProvider }))
                  }
                  className="w-full rounded-lg border border-neutral-200 px-3.5 py-2.5 text-base outline-none focus:border-teal-500"
                >
                  {THIRD_PARTY_PROVIDERS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            )}
              <button
                onClick={() => setTableEditorOpen(false)}
                className="min-h-11 w-full rounded-lg bg-[var(--brand)] py-2.5 text-base font-semibold text-white hover:bg-[var(--brand-dark)]"
              >
                Done
              </button>
            </div>
          ) : (
            <button
              onClick={() => setTableEditorOpen(true)}
              className="flex min-h-12 w-full items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-left hover:border-[var(--brand)]"
            >
              <span className="flex min-w-0 items-center gap-2 text-[15px] text-neutral-700">
                {cart.channel === "Dine in" || cart.channel === "Wait List" ? (
                  <LayoutGrid className="h-4 w-4 shrink-0 text-neutral-400" />
                ) : (
                  <User className="h-4 w-4 shrink-0 text-neutral-400" />
                )}
                <span className="truncate">{setupSummary}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-[var(--brand-dark)]">
                {cart.channel === "Dine in" || cart.channel === "Wait List" ? "Table & guests" : "Details"}
                <ChevronDown className="h-4 w-4" />
              </span>
            </button>
          ))}
      </div>

      {tablePickerOpen && (
        <TableLayoutPicker
          tables={tables}
          selectedTableId={cart.tableId}
          onSelect={(table) => {
            setCart((prev) => ({ ...prev, tableId: table.id, tableNumber: table.number }));
            setTablePickerOpen(false);
          }}
          onClose={() => setTablePickerOpen(false)}
        />
      )}

      <div className={`flex flex-1 flex-col ${tableEditorOpen ? "min-h-16" : "min-h-16 [@media(min-height:860px)]:min-h-[7.5rem]"}`}>
        <div className="mb-2 flex shrink-0 items-center justify-between">
          <h3 className="text-base font-semibold text-neutral-900">Order Tray</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={onAddCustomItem}
              className="flex min-h-10 items-center gap-1.5 rounded-lg border border-dashed border-neutral-300 px-3.5 text-sm font-medium text-neutral-500 hover:border-teal-400 hover:text-teal-600 [&>svg]:size-4"
            >
              <Plus className="h-3 w-3" /> Custom
            </button>
            <span className="text-sm font-semibold text-neutral-400">
              {String(cart.items.reduce((s, i) => s + i.qty, 0)).padStart(2, "0")}
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {cart.items.length === 0 && (
            <div className="flex h-full min-h-16 items-center justify-center text-center text-sm text-neutral-400">
              No items yet.
              <br />
              Tap a dish to add it to the order.
            </div>
          )}
          {cart.items.map((item) => {
            const lineId = item.lineId ?? item.dishId;
            return (
            <div key={lineId} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-[15px] 2xl:text-base">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 font-semibold text-teal-600">{item.qty}x</span>
                  <span className="truncate text-neutral-700">{item.name}</span>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <span className="mr-1 font-semibold text-neutral-800">{formatMoney(item.price * item.qty, currencySymbol)}</span>
                  <button
                    onClick={() => setNoteEditorFor(noteEditorFor === lineId ? null : lineId)}
                    title="Add note for kitchen"
                    className={`flex h-10 w-10 items-center justify-center rounded-lg hover:bg-neutral-50 [&>svg]:size-5 ${item.note ? "text-amber-500" : "text-neutral-300 hover:text-teal-600"}`}
                  >
                    <MessageSquarePlus className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => removeCartItem(lineId)} className="flex h-10 w-10 items-center justify-center rounded-lg text-neutral-300 hover:bg-rose-50 hover:text-rose-500 [&>svg]:size-5">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {item.note && noteEditorFor !== lineId && (
                <div className="ml-5 text-sm italic text-amber-600">Note: {item.note}</div>
              )}
              {noteEditorFor === lineId && (
                <input
                  autoFocus
                  value={item.note ?? ""}
                  onChange={(e) => updateItemNote(lineId, e.target.value)}
                  onBlur={() => setNoteEditorFor(null)}
                  onKeyDown={(e) => e.key === "Enter" && setNoteEditorFor(null)}
                  placeholder="e.g. no onions, extra spicy…"
                  className="ml-5 w-[calc(100%-1.25rem)] rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-base outline-none focus:border-amber-400"
                />
              )}
            </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 shrink-0 space-y-3 border-t border-neutral-100 pt-3">
        <div className="rounded-xl border border-neutral-200 bg-neutral-50">
          <button
            onClick={() => setExtrasOpen((v) => !v)}
            className="flex min-h-11 w-full items-center justify-between gap-2 px-3.5 py-2.5 text-[15px] font-semibold text-neutral-800"
          >
            <span className="flex items-center gap-1.5">
              <TicketPercent className="h-4 w-4 text-neutral-400" /> Discounts &amp; Loyalty
            </span>
            <span className="flex items-center gap-2 text-xs font-medium">
              {discountTotal > 0 && <span className="text-emerald-600">-{formatMoney(discountTotal, currencySymbol)}</span>}
              {cart.loyaltyMember && <span className="text-teal-600">Card added</span>}
              {extrasOpen ? <ChevronUp className="h-4 w-4 text-neutral-400" /> : <ChevronDown className="h-4 w-4 text-neutral-400" />}
            </span>
          </button>
          {extrasOpen && (
            <div className="max-h-52 space-y-3 overflow-y-auto border-t border-neutral-200 p-3">
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium text-neutral-500">
                  <CreditCard className="h-3.5 w-3.5" /> Loyalty Card
                </label>
                {cart.loyaltyMember ? (
                  <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2">
                    <div>
                      <div className="font-mono text-sm font-semibold text-neutral-800">{cart.loyaltyMember.code || "Attached"}</div>
                      {cart.loyaltyMember.name && <div className="text-xs text-neutral-500">{cart.loyaltyMember.name}</div>}
                    </div>
                    <button onClick={removeLoyalty} className="min-h-11 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-500 hover:bg-neutral-50">
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      value={cart.loyaltyContact}
                      onChange={(e) => setCart((prev) => ({ ...prev, loyaltyContact: e.target.value }))}
                      placeholder="Phone, email, or card code"
                      className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-base outline-none focus:border-teal-500"
                    />
                    <button
                      onClick={findOrEnrollLoyalty}
                      disabled={!cart.loyaltyContact.trim()}
                      className="min-h-11 shrink-0 rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:opacity-50"
                    >
                      Find / Enroll
                    </button>
                  </div>
                )}
                {loyaltyError && <p className="text-xs font-medium text-rose-600">{loyaltyError}</p>}
              </div>

              {canDiscount && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-neutral-500">Extra Discount</label>
                  <div className="flex items-center gap-1.5">
                    <div className="relative flex-1">
                      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-neutral-400">
                        {cart.extraDiscountMode === "percent" ? "%" : currencySymbol}
                      </span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={cart.extraDiscount}
                        onChange={(e) => setCart((prev) => ({ ...prev, extraDiscount: e.target.value }))}
                        placeholder="0.00"
                        className="w-full rounded-lg border border-neutral-200 bg-white py-2.5 pl-7 pr-3 text-right text-base outline-none focus:border-teal-500"
                      />
                    </div>
                    <div className="flex shrink-0 rounded-lg border border-neutral-200 bg-white p-0.5">
                      {(["amount", "percent"] as const).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => setCart((prev) => ({ ...prev, extraDiscountMode: mode }))}
                          className={`min-h-10 min-w-10 rounded-md px-3 py-2 text-sm font-semibold ${
                            cart.extraDiscountMode === mode ? "bg-[var(--brand)] text-white" : "text-neutral-500 hover:bg-neutral-50"
                          }`}
                        >
                          {mode === "percent" ? "%" : currencySymbol}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {canDiscount && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-neutral-500">Coupon</label>
                  <div className="flex items-center gap-2">
                    <input
                      value={cart.couponCode}
                      onChange={(e) => setCart((prev) => ({ ...prev, couponCode: e.target.value.toUpperCase() }))}
                      placeholder="Coupon code"
                      disabled={!!cart.appliedCoupon}
                      className="flex-1 rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-base font-mono uppercase outline-none focus:border-teal-500 disabled:bg-neutral-50 disabled:text-neutral-400"
                    />
                    {cart.appliedCoupon ? (
                      <button
                        onClick={removeCoupon}
                        className="shrink-0 min-h-11 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-500 hover:bg-neutral-50"
                      >
                        Remove
                      </button>
                    ) : (
                      <button
                        onClick={applyCoupon}
                        disabled={!cart.couponCode.trim()}
                        className="min-h-11 shrink-0 rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:opacity-50"
                      >
                        Apply
                      </button>
                    )}
                  </div>
                  {couponError && <p className="text-xs font-medium text-rose-600">{couponError}</p>}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-1 text-[15px]">
          {(cart.appliedCoupon || extraDiscountAmount > 0 || tax > 0) && (
            <div className="flex justify-between text-neutral-500">
              <span>Subtotal</span>
              <span>{formatMoney(subtotal, currencySymbol)}</span>
            </div>
          )}
          {cart.appliedCoupon && (
            <div className="flex justify-between text-emerald-600">
              <span>Coupon {cart.appliedCoupon.code}</span>
              <span>-{formatMoney(couponDiscountAmount, currencySymbol)}</span>
            </div>
          )}
          {extraDiscountAmount > 0 && (
            <div className="flex justify-between text-emerald-600">
              <span>Discount</span>
              <span>-{formatMoney(extraDiscountAmount, currencySymbol)}</span>
            </div>
          )}
          {tax > 0 && (
            <div className="flex justify-between text-neutral-500">
              <span>Tax</span>
              <span>{formatMoney(tax, currencySymbol)}</span>
            </div>
          )}
          <div className="flex justify-between pt-1 text-lg font-bold text-neutral-900 2xl:text-xl">
            <span>Total Payable</span>
            <span>{formatMoney(total, currencySymbol)}</span>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-900">{paymentLocked ? "Payment Taken" : "Payment Method"}</h3>
            {!paymentLocked && <span className="text-xs text-neutral-400">Tap more than one to split</span>}
          </div>
          {paymentLocked ? (
            <div className="space-y-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
              {cart.payments.map((p) => (
                <div key={p.method} className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-neutral-700">{p.method}</span>
                  <span className="font-semibold text-neutral-900">{formatMoney(p.amount, currencySymbol)}</span>
                </div>
              ))}
              <button
                onClick={onUnlockPayment}
                className="mt-1 min-h-11 w-full rounded-lg border border-neutral-200 bg-white py-2.5 text-sm font-semibold text-neutral-600 hover:bg-neutral-50"
              >
                Redo Payment
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <PaymentButton
                icon={Wallet}
                label="Cash"
                active={cart.payments.some((p) => p.method === "Cash")}
                onClick={() => togglePaymentLine("Cash")}
              />
              {paymentTerminals.map((t) => (
                <PaymentButton
                  key={t.id}
                  icon={CreditCard}
                  logoUrl={t.logoUrl}
                  label={t.name}
                  active={cart.payments.some((p) => p.method === t.name)}
                  onClick={() => tapTerminal(t)}
                />
              ))}
            </div>
          )}

          {!paymentLocked && cart.payments.length > 0 && (
            <div className="mt-2 max-h-28 space-y-1.5 overflow-y-auto rounded-xl border border-neutral-200 bg-neutral-50 p-2.5 [@media(min-height:760px)]:max-h-36">
              {cart.payments.map((p) => (
                <div key={p.method} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-16 shrink-0 truncate text-sm font-semibold text-neutral-700">{p.method}</span>
                    <div className="relative flex-1">
                      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-neutral-400">
                        {currencySymbol}
                      </span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={p.amount}
                        onChange={(e) => updatePaymentAmount(p.method, Math.max(0, Number(e.target.value) || 0))}
                        className="w-full rounded-lg border border-neutral-200 bg-white py-2 pl-7 pr-3 text-base outline-none focus:border-teal-500"
                      />
                    </div>
                    <button onClick={() => removePaymentLine(p.method)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-neutral-300 hover:bg-rose-50 hover:text-rose-500 [&>svg]:size-5">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {p.method === "Cash" && (
                    <div className="ml-[4.5rem] mr-12 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      <span className="shrink-0 text-neutral-500">Received</span>
                      <div className="relative min-w-[6rem] flex-1">
                        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400">
                          {currencySymbol}
                        </span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={cart.cashReceived}
                          onChange={(e) => setCart((prev) => ({ ...prev, cashReceived: e.target.value }))}
                          placeholder={p.amount.toFixed(2)}
                          className="w-full rounded-lg border border-neutral-200 bg-white py-2 pl-7 pr-3 text-base outline-none focus:border-teal-500"
                        />
                      </div>
                      {changeDue > 0 && (
                        <span className="basis-full text-right font-semibold text-emerald-600">
                          Change {formatMoney(changeDue, currencySymbol)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}

              <div
                className={`flex justify-between border-t border-neutral-200 pt-2 text-xs font-semibold ${
                  isFullyPaid ? "text-emerald-600" : "text-amber-600"
                }`}
              >
                <span>{isFullyPaid ? "Fully paid" : paymentsRemaining > 0 ? "Remaining" : "Overpaid by"}</span>
                <span>{isFullyPaid ? formatMoney(paymentsTotal, currencySymbol) : formatMoney(Math.abs(paymentsRemaining), currencySymbol)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 shrink-0">
        {editingOrder && editingOrder.status !== "Voided" && (
          <div className="mb-3 flex items-center justify-between rounded-xl bg-neutral-50 px-3 py-2 text-sm">
            <span className="text-neutral-500">Order Status</span>
            <StatusStepper status={editingOrder.status} onAdvance={handleAdvanceStatus} hasKitchen={hasKitchen} />
          </div>
        )}

        {editingOrder?.status === "Voided" && (
          <div className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Voided{editingOrder.voidReason ? ` — ${editingOrder.voidReason}` : ""}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={handlePlaceOrder}
            disabled={cart.items.length === 0 || placingOrder}
            title={
              cart.payments.length === 0
                ? hasKitchen
                  ? "No payment taken yet — order will be sent to the kitchen and can be settled later"
                  : "No payment taken yet — order is saved and can be paid later"
                : undefined
            }
            className="min-h-14 flex-1 rounded-xl bg-[var(--brand)] py-4 text-base font-bold text-white transition hover:bg-[var(--brand-dark)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 2xl:min-h-16 2xl:text-lg"
          >
            {/* "Take Payment" once Cash or a card machine has been added on this Till — not for a
                recalled order whose payment was already recorded earlier, which is just an edit. */}
            {cart.payments.length > 0 && !editingOrder?.paymentMethod
              ? "Take Payment"
              : cart.editingOrderId
                ? "Update Order"
                : hasKitchen
                  ? "Send to Kitchen"
                  : "Place Order"}{" "}
            · {formatMoney(total, currencySymbol)}
          </button>
          {editingOrder && editingOrder.status !== "Voided" && editingOrder.status !== "Served" && (
            <button
              onClick={onVoidClick}
              className="flex min-w-14 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-4 text-rose-600 hover:bg-rose-100 [&>svg]:size-5"
              title="Void order"
            >
              <Ban className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {sumupCharging && (
        <SumupChargeOverlay
          terminal={sumupCharging.terminal}
          amount={sumupCharging.amount}
          currencySymbol={currencySymbol}
          onSuccess={(amount) => {
            setCart((prev) => ({ ...prev, payments: [...prev.payments, { method: sumupCharging.terminal.name, amount }] }));
            setSumupCharging(null);
          }}
          onClose={() => setSumupCharging(null)}
        />
      )}
      {teyaCharging && (
        <TeyaChargeOverlay
          terminal={teyaCharging.terminal}
          amount={teyaCharging.amount}
          currencySymbol={currencySymbol}
          onSuccess={(amount) => {
            setCart((prev) => ({ ...prev, payments: [...prev.payments, { method: teyaCharging.terminal.name, amount }] }));
            setTeyaCharging(null);
          }}
          onClose={() => setTeyaCharging(null)}
        />
      )}
    </div>
  );
}

// Lets staff hand the customer a digital copy on the spot — no printer needed — by showing a QR
// that opens their public /invoice/[id] receipt, where they can view, download as PDF, or share it
// onward themselves.
function ShareInvoiceModal({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}/invoice/${orderId}` : "";

  useEffect(() => {
    let cancelled = false;
    if (url) tableOrderQrDataUrl(url).then((v) => !cancelled && setDataUrl(v));
    return () => {
      cancelled = true;
    };
  }, [url]);

  async function copyLink() {
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-xs rounded-2xl bg-white p-6 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Share Invoice</h2>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        {dataUrl ? (
          <img src={dataUrl} alt="Invoice QR" className="mx-auto mb-4 h-48 w-48" />
        ) : (
          <div className="mx-auto mb-4 flex h-48 w-48 items-center justify-center text-sm text-neutral-400">Generating…</div>
        )}
        <p className="mb-3 text-xs text-neutral-400">Have the customer scan this to view or download their invoice as a PDF.</p>
        <button
          onClick={copyLink}
          className="w-full rounded-xl border border-neutral-200 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50"
        >
          {copied ? "Link Copied!" : "Copy Link"}
        </button>
      </div>
    </div>
  );
}

function VoidModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Void this order?</h2>
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

function CustomItemModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (name: string, price: number, qty: number) => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState(1);

  const canSave = name.trim().length > 0 && Number(price) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Add Custom Item</h2>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Item Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="e.g. Extra sauce"
              className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-500">Price</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-500">Qty</label>
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
            </div>
          </div>
        </div>
        <div className="mt-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-neutral-200 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            disabled={!canSave}
            onClick={() => onSave(name.trim(), Number(price), qty)}
            className="flex-1 rounded-xl bg-[var(--brand)] py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add to Order
          </button>
        </div>
      </div>
    </div>
  );
}

function OrderCard({
  order,
  selected,
  onClick,
}: {
  order: Order;
  selected: boolean;
  onClick: () => void;
}) {
  const isVoided = order.status === "Voided";
  const updated = wasOrderUpdated(order);
  return (
    <button
      onClick={onClick}
      className={`flex flex-col gap-2 rounded-2xl border p-4 text-left transition hover:shadow-md active:scale-[0.98] 2xl:p-5 ${
        CARD_TINTS[order.status]
      } ${selected ? "ring-2 ring-teal-500" : ""} ${isVoided ? "opacity-75" : ""}`}
    >
      <div className="flex items-center justify-between text-sm font-semibold text-neutral-800">
        <span className="flex items-center gap-1">
          {isVoided && <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-500" />}
          <span className={isVoided ? "line-through decoration-rose-400" : undefined}>
            Order #{order.orderNumber} <span className="font-normal text-neutral-400">· Seq {orderSequence(order.orderNumber)}</span>
          </span>
        </span>
        <span className="flex items-center gap-1 text-neutral-500">
          {order.channel === "Delivery" && <Bike className="h-3.5 w-3.5 text-blue-500" />}
          {order.channel === "Take Away" && <ShoppingBag className="h-3.5 w-3.5 text-amber-500" />}
          {order.tableNumber
            ? `Table ${String(order.tableNumber).padStart(2, "0")}${
                order.mergedTableNumbers?.length ? ` + ${order.mergedTableNumbers.join(" + ")}` : ""
              }`
            : order.channel}
        </span>
      </div>
      <div className="text-sm text-neutral-500">Item: {order.items.reduce((s, i) => s + i.qty, 0)}X</div>
      {updated && (
        <span className="flex w-fit items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
          <RefreshCw className="h-3 w-3" /> Updated
        </span>
      )}
      {order.placedVia !== "staff" && (
        <span className="flex w-fit items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
          <Globe className="h-3 w-3" /> {order.placedVia === "kiosk" ? "Kiosk" : "Online"}
        </span>
      )}
      <div className="flex items-center justify-between">
        <span className="text-xs text-neutral-400">{formatOrderTimestamp(order.createdAt)}</span>
        <div className="flex items-center gap-1.5">
          {!order.paymentMethod && !isVoided && (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">Unpaid</span>
          )}
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[order.status]}`}>
            {order.status}
          </span>
        </div>
      </div>
    </button>
  );
}

function TopViewTab({
  active,
  icon: Icon,
  label,
  shortLabel,
  count,
  onClick,
}: {
  active: boolean;
  icon: typeof ShoppingBag;
  label: string;
  // Shown instead of `label` below 2xl, so every tab fits one row on an 11" screen.
  shortLabel?: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex min-h-11 items-center whitespace-nowrap gap-1.5 rounded-xl px-2 py-2.5 2xl:gap-2 2xl:px-4 text-sm font-medium transition-colors 2xl:text-base [&>svg]:size-5 ${
        active ? "bg-[var(--brand)] text-white" : "text-neutral-500 hover:bg-neutral-50"
      }`}
    >
      <Icon className="h-4 w-4" />
      {shortLabel ? (
        <>
          <span className="2xl:hidden">{shortLabel}</span>
          <span className="hidden 2xl:inline">{label}</span>
        </>
      ) : (
        label
      )}
      {typeof count === "number" && (
        <span
          className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold ${
            active ? "bg-white/20 text-white" : "bg-neutral-100 text-neutral-500"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// "Online" tab next to Open Tickets: turns red and pulses, with the count, while customer orders
// (website, table QR, kiosk) are waiting to be accepted.
function NewOrdersTab({ active, count, onClick }: { active: boolean; count: number; onClick: () => void }) {
  const waiting = count > 0;
  return (
    <button
      onClick={onClick}
      className={`flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-xl px-2 py-2.5 text-sm font-semibold transition-colors 2xl:gap-2 2xl:px-4 2xl:text-base [&>svg]:size-5 ${
        waiting
          ? `bg-rose-600 text-white hover:bg-rose-700 ${active ? "ring-2 ring-rose-300 ring-offset-1" : "animate-pulse"}`
          : active
            ? "bg-[var(--brand)] text-white"
            : "font-medium text-neutral-500 hover:bg-neutral-50"
      }`}
    >
      <BellRing className="h-4 w-4" />
      <span className="2xl:hidden">Online</span>
      <span className="hidden 2xl:inline">Online Orders</span>
      <span
        className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold ${
          waiting ? "bg-white text-rose-600" : active ? "bg-white/20 text-white" : "bg-neutral-100 text-neutral-500"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

// Customer orders (website, table QR, kiosk) waiting for staff. Accept sends one to the kitchen
// (and into Open Tickets); Reject voids it and frees its table.
function IncomingOrdersView({
  orders,
  currencySymbol,
  handlingId,
  onAccept,
  onReject,
}: {
  orders: Order[];
  currencySymbol: string;
  handlingId: string | null;
  onAccept: (order: Order) => void;
  onReject: (order: Order) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-24 lg:pb-0">
      <p className="mb-3 text-sm text-neutral-500">
        Orders customers placed themselves — from the website, a table QR code or the kiosk. Accept to send one to the kitchen and
        into Open Tickets.
      </p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
        {orders.map((order) => {
          const busy = handlingId === order.id;
          const source = order.createdByName === "Table QR" ? "Table QR" : order.placedVia === "kiosk" ? "Kiosk" : "Website";
          const mins = Math.max(0, Math.floor((now - order.createdAt) / 60_000));
          return (
            <div key={order.id} className="flex flex-col rounded-2xl border-2 border-rose-200 bg-white p-4 shadow-sm">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-lg font-bold text-neutral-900">{order.tableNumber ? `Table ${order.tableNumber}` : order.channel}</span>
                <span className="shrink-0 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-700">{source}</span>
              </div>
              <div className="mb-2 text-xs text-neutral-400">
                #{order.orderNumber} · {mins === 0 ? "just now" : `${mins} min ago`}
                {order.guests > 1 ? ` · ${order.guests} guests` : ""}
              </div>
              <div className="mb-2 truncate text-sm font-medium text-neutral-700">
                {order.customerName || "Guest"}
                {order.customerPhone ? ` · ${order.customerPhone}` : ""}
              </div>
              <ul className="mb-3 space-y-0.5 text-[15px] text-neutral-800">
                {order.items.map((i, idx) => (
                  <li key={i.lineId ?? `${i.dishId}-${idx}`}>
                    <span className="font-semibold text-[var(--brand-dark)]">{i.qty}×</span> {i.name}
                    {i.note ? <span className="text-sm text-neutral-400"> — {i.note}</span> : null}
                  </li>
                ))}
              </ul>
              <div className="mt-auto flex items-center justify-between gap-2 border-t border-neutral-100 pt-3">
                <span className="text-lg font-bold text-neutral-900">{formatMoney(orderTotal(order), currencySymbol)}</span>
                <div className="flex gap-2">
                  <button
                    disabled={busy}
                    onClick={() => onReject(order)}
                    className="min-h-12 rounded-xl border border-rose-200 px-4 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                  >
                    Reject
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => onAccept(order)}
                    className="min-h-12 rounded-xl bg-[var(--brand)] px-5 text-base font-bold text-white hover:bg-[var(--brand-dark)] disabled:opacity-50"
                  >
                    {busy ? "…" : "Accept"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {orders.length === 0 && (
          <div className="col-span-full flex h-40 items-center justify-center text-sm text-neutral-400">No new customer orders waiting.</div>
        )}
      </div>
    </div>
  );
}

const TABLE_STATUS_DOT: Record<RestaurantTable["status"], string> = {
  available: "bg-indigo-400",
  reserved: "bg-orange-400",
  "on-dine": "bg-teal-500",
};

const TABLE_STATUS_CARD: Record<RestaurantTable["status"], string> = {
  available: "bg-indigo-50 border-indigo-200 hover:border-indigo-400",
  reserved: "bg-orange-50 border-orange-200 hover:border-orange-400",
  "on-dine": "bg-teal-50 border-teal-200 hover:border-teal-400",
};

function TablesOverview({
  tables,
  orders,
  area,
  setArea,
  cartTableId,
  onSelect,
  onClear,
  onClearAll,
}: {
  tables: RestaurantTable[];
  orders: Order[];
  area: (typeof TABLE_AREAS)[number];
  setArea: (a: (typeof TABLE_AREAS)[number]) => void;
  cartTableId: string | null;
  onSelect: (table: RestaurantTable) => void;
  onClear: (table: RestaurantTable) => void;
  onClearAll: () => void;
}) {
  const areaTables = tables.filter((t) => t.area === area);
  const busyCount = tables.filter((t) => t.status !== "available").length;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex shrink-0 items-center gap-2 rounded-xl border border-neutral-200 bg-white p-1">
        {TABLE_AREAS.map((a) => (
          <button
            key={a}
            onClick={() => setArea(a)}
            className={`min-h-11 flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors 2xl:text-base ${
              area === a ? "bg-[var(--brand)] text-white" : "text-neutral-500 hover:bg-neutral-50"
            }`}
          >
            {a}
          </button>
        ))}
      </div>

      <div className="mb-4 flex shrink-0 items-center gap-5 text-xs text-neutral-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-indigo-400" /> Available
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-orange-400" /> Reserved
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-teal-500" /> On Dine
        </span>
        {busyCount > 0 && (
          <button
            onClick={onClearAll}
            className="ml-auto flex min-h-11 items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 [&>svg]:size-4"
          >
            <X className="h-4 w-4" /> Free all tables ({busyCount})
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-24 pt-2 lg:pb-0">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-4">
        {areaTables.map((table) => {
          const order = orders.find(
            (o) =>
              (o.tableId === table.id || o.mergedTableNumbers?.includes(table.number)) &&
              o.status !== "Voided" &&
              !isOrderClosedOut(o)
          );
          const isMergedIn = order && order.tableId !== table.id;
          // Any occupied or reserved table can be freed from here (handleClearTable warns first if
          // an open order is still on it).
          const canClear = table.status !== "available";
          return (
            <div key={table.id} className="relative h-full">
              <button
                onClick={() => onSelect(table)}
                className={`flex h-full min-h-[112px] w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 p-4 transition-transform hover:scale-[1.02] active:scale-[0.98] 2xl:p-5 ${canClear ? "pb-12 2xl:pb-12" : ""} ${
                  TABLE_STATUS_CARD[table.status]
                } ${table.id === cartTableId ? "ring-2 ring-teal-500" : ""}`}
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold text-neutral-800">
                  <span className={`h-2 w-2 rounded-full ${TABLE_STATUS_DOT[table.status]}`} />
                  Table #{table.number}
                </span>
                <span className="flex items-center gap-1 text-xs text-neutral-500">
                  <Armchair className="h-3 w-3" /> {table.capacity}
                  {table.status === "on-dine" && (
                    <span className="ml-1 flex items-center gap-0.5">
                      <Users className="h-3 w-3" /> {table.seated}
                    </span>
                  )}
                </span>
                {table.status === "on-dine" && table.seatedAt && (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-teal-700">
                    <Clock className="h-3 w-3" /> {formatOccupiedTime(now - table.seatedAt)}
                  </span>
                )}
                {order && (
                  <span className={`mt-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[order.status]}`}>
                    {isMergedIn ? `Merged → #${order.tableNumber}` : `#${order.orderNumber} · ${order.status}`}
                  </span>
                )}
                {canClear && !order && <span className="mt-1 text-[10px] font-medium text-neutral-400">No order yet</span>}
              </button>
              {canClear && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onClear(table);
                  }}
                  title="Customer left — free this table"
                  className="absolute bottom-2 left-1/2 flex min-h-9 -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-600 shadow-sm hover:bg-rose-50 [&>svg]:size-3.5"
                >
                  <X className="h-3.5 w-3.5" /> Free table
                </button>
              )}
            </div>
          );
        })}
        {areaTables.length === 0 && (
          <div className="col-span-full py-16 text-center text-sm text-neutral-400">No tables in this area.</div>
        )}
      </div>
      </div>
    </div>
  );
}

function CategoryBox({ active, label, icon, onClick }: { active: boolean; label: string; icon: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex min-h-[76px] w-[108px] shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-2xl border p-2 text-center transition active:scale-[0.97] 2xl:min-h-[92px] 2xl:w-[128px] ${
        active
          ? "border-[var(--brand)] bg-[var(--brand)] text-white shadow-sm"
          : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50"
      }`}
    >
      <CategoryIconView icon={icon} name={icon === "all" ? undefined : label} className={`h-6 w-6 shrink-0 ${active ? "text-white" : "text-[var(--brand)]"}`} />
      <span className="line-clamp-2 break-words text-sm font-bold leading-tight 2xl:text-base">{label}</span>
    </button>
  );
}

function PaymentButton({
  icon: Icon,
  logoUrl,
  label,
  active,
  onClick,
}: {
  icon: typeof Wallet;
  logoUrl?: string | null;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-xl border px-2 py-2.5 text-sm font-semibold transition active:scale-95 2xl:min-h-14 2xl:text-base ${
        active ? "border-[var(--brand)] bg-[var(--brand-light)] text-[var(--brand-dark)]" : "border-neutral-200 text-neutral-500 hover:bg-neutral-50"
      }`}
    >
      {logoUrl ? <img src={logoUrl} alt="" className="h-6 w-6 rounded object-contain" /> : <Icon className="h-5 w-5 shrink-0" />}
      <span className="truncate">{label}</span>
    </button>
  );
}

// Shown the moment staff taps a SumUp-paired terminal — starts a charge on the physical reader
// and polls for the result every 2s until it lands on a terminal state. The reader itself is
// where the customer actually taps/inserts/swipes; this screen is just waiting on that.
function SumupChargeOverlay({
  terminal,
  amount,
  currencySymbol,
  onSuccess,
  onClose,
}: {
  terminal: PaymentTerminal;
  amount: number;
  currencySymbol: string;
  onSuccess: (amount: number) => void;
  onClose: () => void;
}) {
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [state, setState] = useState<"starting" | "pending" | "failed" | "cancelled">("starting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    startSumupChargeAction(terminal.id, amount).then((result) => {
      if (cancelled) return;
      if (result.error || !result.checkoutId) {
        setState("failed");
        setErrorMessage(result.error ?? "Couldn't start the charge.");
        return;
      }
      setCheckoutId(result.checkoutId);
      setState("pending");
    });
    return () => {
      cancelled = true;
    };
    // Runs once per mount — a new overlay instance (new terminal/amount) is a new charge attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!checkoutId || state !== "pending") return;
    const id = setInterval(async () => {
      const result = await pollSumupChargeAction(checkoutId);
      if (result.status === "successful") {
        onSuccess(amount);
      } else if (result.status === "failed" || result.status === "cancelled") {
        setState(result.status);
        setErrorMessage(result.failureReason ?? null);
      }
    }, 2000);
    return () => clearInterval(id);
  }, [checkoutId, state, amount, onSuccess]);

  function cancel() {
    if (checkoutId) cancelSumupChargeAction(checkoutId);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
        <h2 className="mb-1 text-lg font-semibold text-neutral-900">{terminal.name}</h2>
        <p className="mb-5 text-2xl font-bold text-neutral-900">{formatMoney(amount, currencySymbol)}</p>

        {(state === "starting" || state === "pending") && (
          <>
            <Loader2 className="mx-auto mb-3 h-10 w-10 animate-spin text-[var(--brand)]" />
            <p className="mb-5 text-sm text-neutral-500">
              {state === "starting" ? "Starting the charge…" : "Waiting for the customer to tap, insert or swipe on the reader…"}
            </p>
            <button
              onClick={cancel}
              className="w-full rounded-xl border border-neutral-200 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50"
            >
              Cancel
            </button>
          </>
        )}

        {(state === "failed" || state === "cancelled") && (
          <>
            <XCircle className="mx-auto mb-3 h-10 w-10 text-rose-500" />
            <p className="mb-5 text-sm text-neutral-500">
              {state === "cancelled" ? "Charge cancelled." : errorMessage || "The charge didn't go through."}
            </p>
            <button
              onClick={onClose}
              className="w-full rounded-xl bg-[var(--brand)] py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]"
            >
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// Same shape as SumupChargeOverlay — Teya has no confirmed webhook/signature model, so this is
// polling-only (see lib/data/teya.ts for why).
function TeyaChargeOverlay({
  terminal,
  amount,
  currencySymbol,
  onSuccess,
  onClose,
}: {
  terminal: PaymentTerminal;
  amount: number;
  currencySymbol: string;
  onSuccess: (amount: number) => void;
  onClose: () => void;
}) {
  const [paymentRequestId, setPaymentRequestId] = useState<string | null>(null);
  const [state, setState] = useState<"starting" | "pending" | "failed" | "cancelled">("starting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    startTeyaChargeAction(terminal.id, amount).then((result) => {
      if (cancelled) return;
      if (result.error || !result.paymentRequestId) {
        setState("failed");
        setErrorMessage(result.error ?? "Couldn't start the charge.");
        return;
      }
      setPaymentRequestId(result.paymentRequestId);
      setState("pending");
    });
    return () => {
      cancelled = true;
    };
    // Runs once per mount — a new overlay instance (new terminal/amount) is a new charge attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!paymentRequestId || state !== "pending") return;
    const id = setInterval(async () => {
      const result = await pollTeyaChargeAction(paymentRequestId);
      if (result.status === "successful") {
        onSuccess(amount);
      } else if (result.status === "failed" || result.status === "cancelled") {
        setState(result.status);
        setErrorMessage(result.failureReason ?? null);
      }
    }, 2000);
    return () => clearInterval(id);
  }, [paymentRequestId, state, amount, onSuccess]);

  function cancel() {
    if (paymentRequestId) cancelTeyaChargeAction(paymentRequestId);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
        <h2 className="mb-1 text-lg font-semibold text-neutral-900">{terminal.name}</h2>
        <p className="mb-5 text-2xl font-bold text-neutral-900">{formatMoney(amount, currencySymbol)}</p>

        {(state === "starting" || state === "pending") && (
          <>
            <Loader2 className="mx-auto mb-3 h-10 w-10 animate-spin text-[var(--brand)]" />
            <p className="mb-5 text-sm text-neutral-500">
              {state === "starting" ? "Starting the charge…" : "Waiting for the customer to tap, insert or swipe on the terminal…"}
            </p>
            <button
              onClick={cancel}
              className="w-full rounded-xl border border-neutral-200 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50"
            >
              Cancel
            </button>
          </>
        )}

        {(state === "failed" || state === "cancelled") && (
          <>
            <XCircle className="mx-auto mb-3 h-10 w-10 text-rose-500" />
            <p className="mb-5 text-sm text-neutral-500">
              {state === "cancelled" ? "Charge cancelled." : errorMessage || "The charge didn't go through."}
            </p>
            <button
              onClick={onClose}
              className="w-full rounded-xl bg-[var(--brand)] py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]"
            >
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// There's no separate "mark as served" step — ready IS served, so "In Kitchen" goes straight to
// Served. "Ready" only still appears here as a fallback for any order that reached that status
// before this changed (nothing sets it anymore — see completeOrderAction/toggleOrderItemReadyAction).
const STATUS_FLOW: Record<Order["status"], Order["status"] | null> = {
  // Accepted/rejected from the Till's incoming-orders bar, never stepped from here.
  Pending: null,
  "Wait List": "In Kitchen",
  "In Kitchen": "Served",
  Ready: "Served",
  Served: null,
  Voided: null,
};

const STATUS_ACTION_LABEL: Record<Order["status"], string> = {
  Pending: "Awaiting acceptance",
  "Wait List": "Send to Kitchen",
  "In Kitchen": "Mark Served",
  Ready: "Mark Served",
  Served: "Done",
  Voided: "Voided",
};

function StatusStepper({
  status,
  onAdvance,
  hasKitchen,
}: {
  status: Order["status"];
  onAdvance: (next: Order["status"]) => void;
  hasKitchen: boolean;
}) {
  const next = STATUS_FLOW[status];
  const label = status === "Wait List" && !hasKitchen ? "Start Order" : STATUS_ACTION_LABEL[status];
  return (
    <button
      disabled={!next}
      onClick={() => next && onAdvance(next)}
      className={`min-h-11 rounded-lg px-4 py-2 text-sm font-semibold ${
        next ? "bg-[var(--brand)] text-white hover:bg-[var(--brand-dark)]" : "bg-neutral-200 text-neutral-500"
      }`}
    >
      {label}
    </button>
  );
}
