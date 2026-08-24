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
}

export type TableArea = "Main Dining" | "Terrace" | "Outdoor";
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

export function formatMoney(amount: number, currencySymbol: string) {
  return `${currencySymbol}${amount.toFixed(2)}`;
}
