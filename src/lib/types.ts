import type { categories, dishes, integrations, orders, paymentTerminals, printers, reservations, restaurants, tables } from "@/db/schema";

export type CategoryIcon =
  | "all"
  | "breakfast"
  | "beef"
  | "biryani"
  | "chicken"
  | "dessert"
  | "dinner"
  | "drinks"
  | "fastfood"
  | "lunch"
  | "platters"
  | "salads"
  | "side"
  | "soups";

export type Restaurant = typeof restaurants.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Dish = typeof dishes.$inferSelect;
export type RestaurantTable = typeof tables.$inferSelect;
export type Reservation = typeof reservations.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Printer = typeof printers.$inferSelect;
export type Integration = typeof integrations.$inferSelect;
export type PaymentTerminal = typeof paymentTerminals.$inferSelect;

export interface OrderItem {
  dishId: string;
  name: string;
  price: number;
  qty: number;
  // Ticked off on the Kitchen Display as each item is prepped; the whole order can only
  // advance past "In Kitchen" once every item is ready.
  ready?: boolean;
  // Free-text prep instruction (e.g. "no onions") — set on the Till, shown on Kitchen Display.
  note?: string;
}

export interface PaymentLine {
  method: string;
  amount: number;
}

export type TableArea = "Ground Floor" | "1st Floor" | "Basement";
export type TableStatus = "available" | "reserved" | "on-dine";
export type ReservationStatus = "upcoming" | "on-dine" | "paid" | "unpaid" | "available";
export type ReservationSource = "walk-in" | "phone" | "online";
export type OrderChannel = "Dine in" | "Wait List" | "Take Away" | "Delivery" | "Online" | "Third Party";
export type ThirdPartyProvider = "Uber Eats" | "Deliveroo" | "Just Eat" | "Other";
export type OrderStatus = "In Kitchen" | "Wait List" | "Ready" | "Served" | "Voided";
export type PrinterStation = "Kitchen" | "Bar" | "Receipt" | "Expo";
export type PrinterConnection = "Bluetooth" | "Network" | "WiFi" | "USB";
export type IntegrationProvider = "Uber Eats" | "Deliveroo" | "Just Eat";

export const PRICING_CHANNELS = ["Dine in", "Take Away", "Delivery", "Online", "Uber Eats", "Deliveroo", "Just Eat"] as const;
export const CURRENCY_OPTIONS = [
  { symbol: "£", label: "£ British Pound" },
  { symbol: "$", label: "$ US Dollar" },
  { symbol: "€", label: "€ Euro" },
  { symbol: "₹", label: "₹ Indian Rupee" },
  { symbol: "A$", label: "A$ Australian Dollar" },
] as const;

export function orderTotal(order: Pick<Order, "items" | "donation">) {
  const subtotal = order.items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const tax = subtotal * 0.06;
  return subtotal + tax + (order.donation ?? 0);
}

// Table occupied-time display (hours/minutes, not seconds — meals run long) for the Till's
// Tables view, distinct from Kitchen Display's mm:ss prep timer.
export function formatOccupiedTime(ms: number) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function formatMoney(amount: number, currencySymbol: string) {
  return `${currencySymbol}${amount.toFixed(2)}`;
}

// A real, always-current date/time for an order, computed from its createdAt timestamp —
// `createdLabel` is only ever set once at creation ("Just now") and never updates, so it goes
// stale immediately and shouldn't be relied on for display.
export function formatOrderTimestamp(createdAt: number) {
  return new Date(createdAt).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Order codes are a base36-encoded counter (see encodeOrderNumber in actions/orders.ts) —
// decoding one back to decimal gives a plain, human-friendly running sequence number, useful
// as a quick reference alongside the code itself (e.g. "#0A532 · Seq 371").
export function orderSequence(orderNumber: string) {
  return parseInt(orderNumber, 36);
}
