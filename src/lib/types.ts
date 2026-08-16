import type { categories, dishes, orders, reservations, tables } from "@/db/schema";

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

export type Category = typeof categories.$inferSelect;
export type Dish = typeof dishes.$inferSelect;
export type RestaurantTable = typeof tables.$inferSelect;
export type Reservation = typeof reservations.$inferSelect;
export type Order = typeof orders.$inferSelect;

export interface OrderItem {
  dishId: string;
  name: string;
  price: number;
  qty: number;
}

export type TableArea = "Main Dining" | "Terrace" | "Outdoor";
export type TableStatus = "available" | "reserved" | "on-dine";
export type ReservationStatus = "upcoming" | "on-dine" | "paid" | "unpaid" | "available";
export type OrderChannel = "Dine in" | "Wait List" | "Take Away";
export type OrderStatus = "In Kitchen" | "Wait List" | "Ready" | "Served";
