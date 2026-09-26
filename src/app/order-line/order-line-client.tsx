"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CategoryIconView } from "@/components/category-icon";
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
import { formatMoney } from "@/lib/types";
import { placeOrderAction, setOrderStatusAction, voidOrderAction } from "@/lib/actions/orders";
import { printTicket } from "@/lib/print-ticket";
import { TableLayoutPicker } from "@/components/table-layout-picker";
import {
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  Pencil,
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
  CheckCircle2,
} from "lucide-react";

const QUEUE_TABS = ["All", "Dine in", "Wait List", "Take Away", "Delivery", "Served"] as const;
type QueueTab = (typeof QUEUE_TABS)[number];

const STATUS_STYLES: Record<Order["status"], string> = {
  "In Kitchen": "bg-teal-100 text-teal-700",
  "Wait List": "bg-orange-100 text-orange-700",
  Ready: "bg-purple-100 text-purple-700",
  Served: "bg-neutral-100 text-neutral-600",
  Voided: "bg-rose-100 text-rose-700",
};

const CARD_TINTS: Record<Order["status"], string> = {
  "In Kitchen": "bg-teal-50 border-teal-100",
  "Wait List": "bg-orange-50 border-orange-100",
  Ready: "bg-purple-50 border-purple-100",
  Served: "bg-neutral-50 border-neutral-100",
  Voided: "bg-rose-50 border-rose-100",
};

const CHANNELS: OrderChannel[] = ["Dine in", "Wait List", "Take Away", "Delivery", "Online", "Third Party"];
const THIRD_PARTY_PROVIDERS: ThirdPartyProvider[] = ["Uber Eats", "Deliveroo", "Just Eat", "Other"];

const TAX_RATE = 0.06;

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
};

export function OrderLineClient({
  categories,
  dishes,
  tables,
  orders,
  paymentTerminals,
  currencySymbol,
  restaurantName,
  invoiceAddress,
  invoicePhone,
  invoiceWebsite,
  invoiceLogoUrl,
  invoiceFooterText,
}: {
  categories: Category[];
  dishes: Dish[];
  tables: RestaurantTable[];
  orders: Order[];
  paymentTerminals: PaymentTerminal[];
  currencySymbol: string;
  restaurantName: string;
  invoiceAddress?: string;
  invoicePhone?: string;
  invoiceWebsite?: string;
  invoiceLogoUrl?: string;
  invoiceFooterText: string;
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
  const [donation, setDonation] = useState(true);
  const [noteEditorFor, setNoteEditorFor] = useState<string | null>(null);
  const [customItemModalOpen, setCustomItemModalOpen] = useState(false);
  // Open by default for a brand-new order so Order Type/table selection is the first thing
  // staff see — collapsed when a table was already picked from Manage Table, or when editing.
  const [tableEditorOpen, setTableEditorOpen] = useState(() => !searchParams.get("tableId"));
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [voidModalOpen, setVoidModalOpen] = useState(false);

  const queueRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Poll for changes made elsewhere (kitchen marking an order ready, another till voiding
  // one, etc.) so status notifications below stay current without a manual refresh.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 8000);
    return () => clearInterval(id);
  }, [router]);

  const [notifications, setNotifications] = useState<{ id: string; text: string; status: OrderStatus }[]>([]);
  const knownStatusRef = useRef<Map<string, OrderStatus> | null>(null);

  useEffect(() => {
    const known = knownStatusRef.current;
    if (known) {
      const newlyChanged: { id: string; text: string; status: OrderStatus }[] = [];
      for (const order of orders) {
        const prevStatus = known.get(order.id);
        if (prevStatus && prevStatus !== order.status) {
          const where = order.tableNumber ? `Table ${String(order.tableNumber).padStart(2, "0")}` : order.channel;
          newlyChanged.push({
            id: `${order.id}-${order.status}-${Date.now()}`,
            text: `Order #${order.orderNumber} · ${where} is now ${order.status}`,
            status: order.status,
          });
        }
      }
      if (newlyChanged.length > 0) {
        // Deferred a tick so this doesn't set state synchronously within the effect body.
        setTimeout(() => setNotifications((prev) => [...newlyChanged, ...prev].slice(0, 5)), 0);
        newlyChanged.forEach((n) => {
          setTimeout(() => setNotifications((prev) => prev.filter((x) => x.id !== n.id)), 7000);
        });
      }
    }
    knownStatusRef.current = new Map(orders.map((o) => [o.id, o.status]));
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (queueTab === "All") return true;
      if (queueTab === "Dine in") return o.channel === "Dine in";
      if (queueTab === "Wait List") return o.status === "Wait List";
      if (queueTab === "Take Away") return o.channel === "Take Away";
      if (queueTab === "Delivery") return o.channel === "Delivery" || o.channel === "Third Party";
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
      Delivery: orders.filter((o) => o.channel === "Delivery" || o.channel === "Third Party").length,
      Served: orders.filter((o) => o.status === "Served").length,
    } satisfies Record<QueueTab, number>;
  }, [orders]);

  const menuDishes = useMemo(() => {
    if (menuCategory === "all") return dishes;
    return dishes.filter((d) => d.categoryId === menuCategory);
  }, [dishes, menuCategory]);

  const priceFor = (dish: Dish) => {
    const key = cart.channel === "Third Party" ? cart.thirdPartyProvider : cart.channel;
    return dish.channelPrices?.[key] ?? dish.price;
  };
  const qtyFor = (dishId: string) => cart.items.find((i) => i.dishId === dishId)?.qty ?? 0;

  const subtotal = cart.items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const tax = subtotal * TAX_RATE;
  const donationAmount = donation && cart.items.length > 0 ? 1 : 0;
  const total = subtotal + tax + donationAmount;

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
      return { ...prev, items: [...prev.items, { dishId: dish.id, name: dish.name, price: priceFor(dish), qty: 1 }] };
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

  function addCustomItem(name: string, price: number, qty: number) {
    setCart((prev) => ({
      ...prev,
      items: [...prev.items, { dishId: `custom:${crypto.randomUUID()}`, name, price, qty }],
    }));
  }

  function updateItemNote(dishId: string, note: string) {
    setCart((prev) => ({
      ...prev,
      items: prev.items.map((i) => (i.dishId === dishId ? { ...i, note: note || undefined } : i)),
    }));
  }

  function loadOrderIntoCart(order: Order) {
    const orderTotalAmount = order.items.reduce((sum, i) => sum + i.price * i.qty, 0) * (1 + TAX_RATE) + (order.donation ?? 0);
    const payments: PaymentLine[] =
      order.payments?.length ? order.payments : order.paymentMethod ? [{ method: order.paymentMethod, amount: orderTotalAmount }] : [];

    setCart({
      editingOrderId: order.id,
      tableId: order.tableId,
      tableNumber: order.tableNumber,
      guests: order.guests,
      channel: order.channel,
      thirdPartyProvider: order.thirdPartyProvider ?? "Uber Eats",
      items: order.items,
      customerName: order.customerName ?? "",
      customerPhone: order.customerPhone ?? "",
      customerAddress: order.customerAddress ?? "",
      payments,
      cashReceived: order.cashReceived ? String(order.cashReceived) : "",
    });
    setDonation((order.donation ?? 0) > 0);
    setTableEditorOpen(false);
    setMobileCartOpen(true);
  }

  const paymentsTotal = cart.payments.reduce((sum, p) => sum + p.amount, 0);
  const paymentsRemaining = total - paymentsTotal;
  const isFullyPaid = cart.items.length > 0 && Math.abs(paymentsRemaining) < 0.01;
  const cashLine = cart.payments.find((p) => p.method === "Cash");
  const cashReceivedAmount = Number(cart.cashReceived) || 0;
  const changeDue = cashLine && cashReceivedAmount > cashLine.amount ? cashReceivedAmount - cashLine.amount : 0;

  function handlePlaceOrder() {
    if (cart.items.length === 0) return;
    startTransition(async () => {
      await placeOrderAction({
        editingOrderId: cart.editingOrderId,
        tableId: cart.tableId,
        tableNumber: cart.tableNumber,
        guests: cart.guests,
        channel: cart.channel,
        thirdPartyProvider: cart.channel === "Third Party" ? cart.thirdPartyProvider : undefined,
        items: cart.items,
        payments: cart.payments,
        cashReceived: cashLine ? cashReceivedAmount || undefined : undefined,
        donation: donationAmount,
        customerName: cart.customerName.trim() || undefined,
        customerPhone: cart.customerPhone.trim() || undefined,
        customerAddress: cart.customerAddress.trim() || undefined,
      });
      setCart(emptyCart);
      setDonation(true);
      setTableEditorOpen(true);
      setMobileCartOpen(false);
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

  function handlePrint() {
    printTicket({
      orderNumber: editingOrder?.orderNumber ?? "NEW",
      tableNumber: cart.tableNumber,
      channel: cart.channel,
      items: cart.items,
      subtotal,
      tax,
      donation: donationAmount,
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
    tableEditorOpen,
    setTableEditorOpen,
    tablePickerOpen,
    setTablePickerOpen,
    tables,
    subtotal,
    tax,
    donation,
    setDonation,
    donationAmount,
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
    handleAdvanceStatus,
    handlePrint,
    onVoidClick: () => setVoidModalOpen(true),
    onClose: () => setMobileCartOpen(false),
  };

  return (
    <div className="flex h-full min-h-0">
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

      {/* Main column */}
      <div className="flex-1 overflow-y-auto p-6 pb-24 lg:pb-6">
        <h1 className="mb-4 text-xl font-semibold text-neutral-900">Till</h1>

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
                  <span className="flex items-center gap-1 text-neutral-500">
                    {order.channel === "Delivery" && <Bike className="h-3.5 w-3.5 text-blue-500" />}
                    {order.channel === "Take Away" && <ShoppingBag className="h-3.5 w-3.5 text-amber-500" />}
                    {order.tableNumber ? `Table ${String(order.tableNumber).padStart(2, "0")}` : order.channel}
                  </span>
                </div>
                <div className="text-sm text-neutral-500">Item: {order.items.reduce((s, i) => s + i.qty, 0)}X</div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-400">{order.createdLabel}</span>
                  <div className="flex items-center gap-1.5">
                    {!order.paymentMethod && order.status !== "Voided" && (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                        Unpaid
                      </span>
                    )}
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[order.status]}`}>
                      {order.status}
                    </span>
                  </div>
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
            const price = priceFor(dish);
            return (
              <div
                key={dish.id}
                className={`flex flex-col rounded-2xl border bg-white p-4 transition-shadow hover:shadow-md ${
                  qty > 0 ? "border-teal-400 ring-1 ring-teal-100" : "border-neutral-200"
                }`}
              >
                {dish.imageUrl ? (
                  <img src={dish.imageUrl} alt={dish.name} className="mb-3 h-14 w-14 rounded-xl object-cover" />
                ) : (
                  <div
                    className="mb-3 flex h-14 w-14 items-center justify-center rounded-full text-2xl"
                    style={{ backgroundColor: dish.color }}
                  >
                    {dish.emoji}
                  </div>
                )}
                <div className="text-xs text-neutral-400">
                  {categories.find((c) => c.id === dish.categoryId)?.name}
                </div>
                <div className="mb-2 line-clamp-1 font-semibold text-neutral-900">{dish.name}</div>
                <div className="mt-auto flex items-center justify-between">
                  <span className="font-semibold text-neutral-800">
                    {formatMoney(price, currencySymbol)}
                    {price !== dish.price && <span className="ml-1 text-[10px] font-normal text-teal-600">({cart.channel})</span>}
                  </span>
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

      {/* Desktop cart panel */}
      <div className="hidden w-[400px] shrink-0 flex-col border-l border-neutral-200 bg-white p-5 lg:flex min-h-0">
        <CartPanel {...cartPanelProps} showClose={false} />
      </div>

      {/* Mobile / handheld floating cart button */}
      {!mobileCartOpen && (
        <button
          onClick={() => setMobileCartOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-teal-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-teal-600/30 lg:hidden"
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
      {customItemModalOpen && (
        <CustomItemModal
          onClose={() => setCustomItemModalOpen(false)}
          onSave={(name, price, qty) => {
            addCustomItem(name, price, qty);
            setCustomItemModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

interface CartPanelProps {
  cart: CartState;
  setCart: React.Dispatch<React.SetStateAction<CartState>>;
  editingOrder: Order | null | undefined;
  tableEditorOpen: boolean;
  setTableEditorOpen: (v: boolean | ((v: boolean) => boolean)) => void;
  tablePickerOpen: boolean;
  setTablePickerOpen: (v: boolean) => void;
  tables: RestaurantTable[];
  subtotal: number;
  tax: number;
  donation: boolean;
  setDonation: (v: boolean) => void;
  donationAmount: number;
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
  updateItemNote: (dishId: string, note: string) => void;
  onAddCustomItem: () => void;
  handlePlaceOrder: () => void;
  handleAdvanceStatus: (next: OrderStatus) => void;
  handlePrint: () => void;
  onVoidClick: () => void;
  onClose: () => void;
  showClose: boolean;
}

function CartPanel({
  cart,
  setCart,
  editingOrder,
  tableEditorOpen,
  setTableEditorOpen,
  tablePickerOpen,
  setTablePickerOpen,
  tables,
  subtotal,
  tax,
  donation,
  setDonation,
  donationAmount,
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
  handleAdvanceStatus,
  handlePrint,
  onVoidClick,
  onClose,
  showClose,
}: CartPanelProps) {
  function addPaymentLine(method: string) {
    setCart((prev) => {
      if (prev.payments.some((p) => p.method === method)) return prev;
      const applied = prev.payments.reduce((s, p) => s + p.amount, 0);
      const remaining = Math.max(0, Math.round((total - applied) * 100) / 100);
      return { ...prev, payments: [...prev.payments, { method, amount: remaining }] };
    });
  }

  function updatePaymentAmount(method: string, amount: number) {
    setCart((prev) => ({
      ...prev,
      payments: prev.payments.map((p) => (p.method === method ? { ...p, amount } : p)),
    }));
  }

  function removePaymentLine(method: string) {
    setCart((prev) => ({ ...prev, payments: prev.payments.filter((p) => p.method !== method) }));
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-4 flex shrink-0 items-start justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-neutral-900">
            {cart.tableNumber
              ? `Table No #${String(cart.tableNumber).padStart(2, "0")}`
              : cart.customerName
                ? `${cart.channel} · ${cart.customerName}`
                : `${cart.channel} Order`}
            {cart.channel === "Delivery" && <Bike className="h-4 w-4 text-blue-500" />}
            {cart.channel === "Take Away" && <ShoppingBag className="h-4 w-4 text-amber-500" />}
          </h2>
          <p className="mt-0.5 text-sm text-neutral-400">
            {cart.editingOrderId ? `Order #${editingOrder?.orderNumber}` : "New Order"}
            {cart.channel === "Dine in" || cart.channel === "Wait List" ? (
              <>
                {" · "}
                {cart.guests} {cart.guests === 1 ? "Person" : "People"}
              </>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handlePrint}
            className="rounded-lg border border-neutral-200 p-1.5 text-neutral-400 hover:bg-neutral-50 hover:text-teal-600"
            title="Print ticket"
          >
            <Printer className="h-4 w-4" />
          </button>
          <button
            onClick={() => setTableEditorOpen((v) => !v)}
            className="rounded-lg border border-neutral-200 p-1.5 text-neutral-400 hover:bg-neutral-50 hover:text-teal-600"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              setCart(emptyCart);
              setTableEditorOpen(true);
            }}
            className="rounded-lg border border-neutral-200 p-1.5 text-neutral-400 hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          {showClose && (
            <button
              onClick={onClose}
              className="rounded-lg border border-neutral-200 p-1.5 text-neutral-400 hover:bg-neutral-50"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Everything below the header scrolls as one region so the Place Order button at the
          bottom always stays reachable, however much the order-type/payment sections grow. */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
      {tableEditorOpen && (
        <div className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Order Type</label>
            <div className="grid grid-cols-3 gap-1.5">
              {CHANNELS.map((c) => (
                <button
                  key={c}
                  onClick={() => setCart((prev) => ({ ...prev, channel: c }))}
                  className={`rounded-lg border px-2 py-1.5 text-xs font-medium ${
                    cart.channel === c ? "border-teal-600 bg-teal-600 text-white" : "border-neutral-200 text-neutral-500"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {(cart.channel === "Dine in" || cart.channel === "Wait List") && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-500">Table</label>
                <button
                  onClick={() => setTablePickerOpen(true)}
                  className="flex w-full items-center justify-between rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left text-sm text-neutral-700 hover:border-teal-400"
                >
                  {cart.tableNumber ? (
                    <span className="font-medium">Table {String(cart.tableNumber).padStart(2, "0")}</span>
                  ) : (
                    <span className="text-neutral-400">No table selected</span>
                  )}
                  <LayoutGrid className="h-4 w-4 text-neutral-400" />
                </button>
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
            </>
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
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-teal-500"
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
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-teal-500"
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
                className="w-full resize-none rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-teal-500"
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
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-teal-500"
              >
                {THIRD_PARTY_PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

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

      <div>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-900">Order Tray</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={onAddCustomItem}
              className="flex items-center gap-1 rounded-lg border border-dashed border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-500 hover:border-teal-400 hover:text-teal-600"
            >
              <Plus className="h-3 w-3" /> Custom
            </button>
            <span className="text-sm font-semibold text-neutral-400">
              {String(cart.items.reduce((s, i) => s + i.qty, 0)).padStart(2, "0")}
            </span>
          </div>
        </div>

        <div className="space-y-3">
          {cart.items.length === 0 && (
            <div className="flex h-32 items-center justify-center text-center text-sm text-neutral-400">
              No items yet.
              <br />
              Tap a dish to add it to the order.
            </div>
          )}
          {cart.items.map((item) => (
            <div key={item.dishId} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 font-semibold text-teal-600">{item.qty}x</span>
                  <span className="truncate text-neutral-700">{item.name}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="font-semibold text-neutral-800">{formatMoney(item.price * item.qty, currencySymbol)}</span>
                  <button
                    onClick={() => setNoteEditorFor(noteEditorFor === item.dishId ? null : item.dishId)}
                    title="Add note for kitchen"
                    className={`rounded p-0.5 ${item.note ? "text-amber-500" : "text-neutral-300 hover:text-teal-600"}`}
                  >
                    <MessageSquarePlus className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => removeCartItem(item.dishId)} className="text-neutral-300 hover:text-rose-500">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {item.note && noteEditorFor !== item.dishId && (
                <div className="ml-5 text-xs italic text-amber-600">Note: {item.note}</div>
              )}
              {noteEditorFor === item.dishId && (
                <input
                  autoFocus
                  value={item.note ?? ""}
                  onChange={(e) => updateItemNote(item.dishId, e.target.value)}
                  onBlur={() => setNoteEditorFor(null)}
                  onKeyDown={(e) => e.key === "Enter" && setNoteEditorFor(null)}
                  placeholder="e.g. no onions, extra spicy…"
                  className="ml-5 w-[calc(100%-1.25rem)] rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs outline-none focus:border-amber-400"
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="space-y-2 border-t border-neutral-100 pt-4">
          <h3 className="mb-1 text-sm font-semibold text-neutral-900">Payment Summary</h3>
          <div className="flex justify-between text-sm text-neutral-500">
            <span>Subtotal</span>
            <span>{formatMoney(subtotal, currencySymbol)}</span>
          </div>
          <div className="flex justify-between text-sm text-neutral-500">
            <span>Tax (6%)</span>
            <span>{formatMoney(tax, currencySymbol)}</span>
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
            <span>{formatMoney(donationAmount, currencySymbol)}</span>
          </label>
          <div className="flex justify-between border-t border-neutral-100 pt-2 text-base font-semibold text-neutral-900">
            <span>Total Payable</span>
            <span>{formatMoney(total, currencySymbol)}</span>
          </div>
        </div>

        <div className="mt-4">
          <h3 className="mb-2 text-sm font-semibold text-neutral-900">Payment Method</h3>
          <p className="mb-2 text-xs text-neutral-400">
            Tap a method to apply it — tap more than one to split the bill across them.
          </p>
          <div className="grid grid-cols-3 gap-2">
            <PaymentButton
              icon={Wallet}
              label="Cash"
              active={cart.payments.some((p) => p.method === "Cash")}
              onClick={() => addPaymentLine("Cash")}
            />
            {paymentTerminals.map((t) => (
              <PaymentButton
                key={t.id}
                icon={CreditCard}
                label={t.name}
                active={cart.payments.some((p) => p.method === t.name)}
                onClick={() => addPaymentLine(t.name)}
              />
            ))}
          </div>

          {cart.payments.length > 0 && (
            <div className="mt-3 space-y-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
              {cart.payments.map((p) => (
                <div key={p.method} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-20 shrink-0 truncate text-xs font-semibold text-neutral-700">{p.method}</span>
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
                        className="w-full rounded-lg border border-neutral-200 bg-white py-1.5 pl-6 pr-2 text-sm outline-none focus:border-teal-500"
                      />
                    </div>
                    <button onClick={() => removePaymentLine(p.method)} className="text-neutral-300 hover:text-rose-500">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {p.method === "Cash" && (
                    <div className="ml-[5.5rem] flex items-center gap-2 text-xs">
                      <span className="shrink-0 text-neutral-500">Received</span>
                      <div className="relative flex-1">
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
                          className="w-full rounded-lg border border-neutral-200 bg-white py-1.5 pl-6 pr-2 outline-none focus:border-teal-500"
                        />
                      </div>
                      {changeDue > 0 && (
                        <span className="shrink-0 font-semibold text-emerald-600">
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
      </div>

      <div className="shrink-0">
        {editingOrder && editingOrder.status !== "Voided" && (
          <div className="mb-4 flex items-center justify-between rounded-xl bg-neutral-50 px-3 py-2 text-sm">
            <span className="text-neutral-500">Order Status</span>
            <StatusStepper status={editingOrder.status} onAdvance={handleAdvanceStatus} />
          </div>
        )}

        {editingOrder?.status === "Voided" && (
          <div className="mb-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Voided{editingOrder.voidReason ? ` — ${editingOrder.voidReason}` : ""}
          </div>
        )}

        <div className="flex gap-2 border-t border-neutral-100 pt-4">
          <button
            onClick={handlePlaceOrder}
            disabled={cart.items.length === 0}
            title={
              !isFullyPaid && cart.payments.length === 0
                ? "No payment taken yet — order will be sent to the kitchen and can be settled later"
                : undefined
            }
            className="flex-1 rounded-xl bg-teal-600 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {cart.editingOrderId ? "Update Order" : isFullyPaid ? "Place Order" : "Send to Kitchen"} ·{" "}
            {formatMoney(total, currencySymbol)}
          </button>
          {editingOrder && editingOrder.status !== "Voided" && editingOrder.status !== "Served" && (
            <button
              onClick={onVoidClick}
              className="flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-4 text-rose-600 hover:bg-rose-100"
              title="Void order"
            >
              <Ban className="h-4 w-4" />
            </button>
          )}
        </div>
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
            className="flex-1 rounded-xl bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add to Order
          </button>
        </div>
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
  Voided: null,
};

const STATUS_ACTION_LABEL: Record<Order["status"], string> = {
  "Wait List": "Send to Kitchen",
  "In Kitchen": "Mark Ready",
  Ready: "Mark Served",
  Served: "Done",
  Voided: "Voided",
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
