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

export interface Category {
  id: string;
  name: string;
  icon: CategoryIcon;
}

export interface Dish {
  id: string;
  name: string;
  categoryId: string;
  price: number;
  emoji: string;
  color: string;
  description?: string;
}

export type TableArea = "Main Dining" | "Terrace" | "Outdoor";
export type TableStatus = "available" | "reserved" | "on-dine";

export interface RestaurantTable {
  id: string;
  number: number;
  area: TableArea;
  capacity: number;
  status: TableStatus;
  seated: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ReservationStatus = "upcoming" | "on-dine" | "paid" | "unpaid" | "available";

export interface Reservation {
  id: string;
  customerName: string;
  phone?: string;
  time: string;
  date: string;
  tableId: string | null;
  tableNumber: number | null;
  guests: number;
  status: ReservationStatus;
  meal: "Breakfast" | "Lunch" | "Dinner";
}

export interface OrderItem {
  dishId: string;
  name: string;
  price: number;
  qty: number;
}

export type OrderChannel = "Dine in" | "Wait List" | "Take Away";
export type OrderStatus = "In Kitchen" | "Wait List" | "Ready" | "Served";

export interface Order {
  id: string;
  orderNumber: string;
  tableId: string | null;
  tableNumber: number | null;
  guests: number;
  channel: OrderChannel;
  status: OrderStatus;
  items: OrderItem[];
  createdAt: number;
  createdLabel: string;
  paymentMethod?: "Cash" | "Card" | "Scan";
  donation?: number;
}
