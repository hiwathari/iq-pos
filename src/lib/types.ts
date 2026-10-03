import type {
  categories,
  coupons,
  dishes,
  integrations,
  inventoryItems,
  loyaltyMembers,
  orders,
  paymentTerminals,
  pettyCashEntries,
  printers,
  reservations,
  restaurants,
  shifts,
  tables,
  terminalExpenses,
  terminalPayouts,
} from "@/db/schema";

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
export type Shift = typeof shifts.$inferSelect;
export type Coupon = typeof coupons.$inferSelect;
export type CouponType = "percent" | "fixed";
export type LoyaltyMember = typeof loyaltyMembers.$inferSelect;
export type LoyaltyContactType = "phone" | "email";
export type InventoryItem = typeof inventoryItems.$inferSelect;
export type PettyCashEntry = typeof pettyCashEntries.$inferSelect;
export type TerminalPayout = typeof terminalPayouts.$inferSelect;
export type TerminalExpense = typeof terminalExpenses.$inferSelect;

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
  // Identifies one cart/ticket line independent of dishId, so the same dish can appear as two
  // separate lines with different notes instead of merging into one "2x" line that can only
  // carry a single note. Optional so orders placed before this existed still load fine — those
  // fall back to matching by dishId wherever a line needs to be targeted individually.
  lineId?: string;
  // The tax rate (percent) that applied to this line at the moment it was ordered — snapshotted
  // from the dish's category (see Category.taxRatePercent) so an order's total stays correct and
  // reproducible even if the category's rate changes, or tax gets turned on/off, later. Absent
  // (or 0) means no tax, which is every order placed while the restaurant has tax disabled.
  taxRate?: number;
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
// A category's Kitchen Display override: null = automatic (derive from its printer's station,
// the old behavior), "None" = hide from every Kitchen Display station, or pin to one specific
// station regardless of printer. See kitchen-client.tsx's resolveItemDisplayStation.
export type CategoryDisplayOverride = PrinterStation | "None" | null;
export type PrinterConnection = "Bluetooth" | "Network" | "WiFi" | "USB";
export type PrinterKind = "printer" | "display" | "both";
// "cafe" drives direct-serve: a fully-paid new order skips the kitchen ticket step and is
// created straight as Served. See restaurants.businessType / placeOrderAction.
export type BusinessType = "restaurant" | "cafe";
export type IntegrationProvider = "Uber Eats" | "Deliveroo" | "Just Eat";

export const PRICING_CHANNELS = ["Dine in", "Take Away", "Delivery", "Online", "Uber Eats", "Deliveroo", "Just Eat"] as const;
export const CURRENCY_OPTIONS = [
  { symbol: "£", label: "£ British Pound" },
  { symbol: "$", label: "$ US Dollar" },
  { symbol: "€", label: "€ Euro" },
  { symbol: "₹", label: "₹ Indian Rupee" },
  { symbol: "A$", label: "A$ Australian Dollar" },
] as const;

// Each item carries its own snapshotted tax rate (see OrderItem.taxRate) rather than one flat
// restaurant-wide rate, since different menu categories can be taxed differently. An extra
// discount / coupon reduces the taxable amount proportionally across every line, the same way a
// single flat rate always did — it just adds up per-item now instead of multiplying once.
export function orderTotal(order: Pick<Order, "items" | "extraDiscount" | "couponDiscount">) {
  return orderBreakdown(order).total;
}

// Same per-item, proportional-discount math as orderTotal, but exposing every component — used
// wherever a full breakdown needs to be displayed (e.g. a printed/shared invoice) rather than
// just the bottom-line figure.
export function orderBreakdown(order: Pick<Order, "items" | "extraDiscount" | "couponDiscount">) {
  const subtotal = order.items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const discount = Math.min(subtotal, (order.extraDiscount ?? 0) + (order.couponDiscount ?? 0));
  const discountFactor = subtotal > 0 ? (subtotal - discount) / subtotal : 0;
  const rawTax = order.items.reduce((sum, i) => sum + i.price * i.qty * ((i.taxRate ?? 0) / 100), 0);
  const tax = rawTax * discountFactor;
  return { subtotal, discount, tax, total: subtotal - discount + tax };
}

// Resolves a coupon's percent/fixed value into an actual currency amount against a given
// subtotal — shared by the Till (live preview before an order is saved) and the server action
// that places the order, so the two can never disagree on what a coupon is worth.
export function resolveCouponDiscount(coupon: Pick<Coupon, "type" | "value">, subtotal: number) {
  const raw = coupon.type === "percent" ? (subtotal * coupon.value) / 100 : coupon.value;
  return Math.max(0, Math.min(subtotal, raw));
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
