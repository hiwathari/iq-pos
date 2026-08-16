import type { Category, Dish, Order, Reservation, RestaurantTable, TableStatus } from "./types";
import { categories as seedCategories, dishes as seedDishes, initialOrders, initialReservations, initialTables } from "./mock-data";

const STORAGE_KEY = "iq-pos-state-v1";

export interface PersistedState {
  categories: Category[];
  dishes: Dish[];
  tables: RestaurantTable[];
  reservations: Reservation[];
  orders: Order[];
}

function seedState(): PersistedState {
  return {
    categories: seedCategories,
    dishes: seedDishes,
    tables: initialTables(),
    reservations: initialReservations(),
    orders: initialOrders(),
  };
}

type Listener = () => void;

let orderCounter = 31;
const rid = () => Math.random().toString(36).slice(2, 8);

class PersistedStore {
  private state: PersistedState = seedState();
  private readonly serverSnapshot: PersistedState = this.state;
  private listeners = new Set<Listener>();

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.state;
  getServerSnapshot = () => this.serverSnapshot;

  private commit(next: PersistedState) {
    this.state = next;
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // storage unavailable, ignore
      }
    }
    this.listeners.forEach((l) => l());
  }

  hydrateFromStorage() {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      this.state = {
        categories: parsed.categories ?? this.state.categories,
        dishes: parsed.dishes ?? this.state.dishes,
        tables: parsed.tables ?? this.state.tables,
        reservations: parsed.reservations ?? this.state.reservations,
        orders: parsed.orders ?? this.state.orders,
      };
      this.listeners.forEach((l) => l());
    } catch {
      // corrupt storage, ignore and keep seed
    }
  }

  addCategory(name: string) {
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + rid();
    this.commit({ ...this.state, categories: [...this.state.categories, { id, name, icon: "all" }] });
  }

  addDish(dish: Omit<Dish, "id">) {
    const id = dish.categoryId + "-" + dish.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + rid();
    this.commit({ ...this.state, dishes: [...this.state.dishes, { ...dish, id }] });
  }

  updateDish(id: string, patch: Partial<Dish>) {
    this.commit({ ...this.state, dishes: this.state.dishes.map((d) => (d.id === id ? { ...d, ...patch } : d)) });
  }

  deleteDish(id: string) {
    this.commit({ ...this.state, dishes: this.state.dishes.filter((d) => d.id !== id) });
  }

  setTableStatus(id: string, status: TableStatus, seated?: number) {
    this.commit({
      ...this.state,
      tables: this.state.tables.map((t) =>
        t.id === id ? { ...t, status, seated: seated ?? (status === "available" ? 0 : t.seated) } : t
      ),
    });
  }

  addReservation(r: Omit<Reservation, "id">) {
    const id = "res-" + rid();
    const tables = r.tableId
      ? this.state.tables.map((t) => (t.id === r.tableId ? { ...t, status: "reserved" as TableStatus } : t))
      : this.state.tables;
    this.commit({ ...this.state, reservations: [{ ...r, id }, ...this.state.reservations], tables });
  }

  addOrder(order: Omit<Order, "id" | "orderNumber" | "createdAt" | "createdLabel">, tableId: string | null, guests: number) {
    orderCounter += 1;
    const newOrder: Order = {
      ...order,
      id: "order-" + rid(),
      orderNumber: "F" + String(orderCounter).padStart(4, "0"),
      createdAt: Date.now(),
      createdLabel: "Just now",
    };
    const tables = tableId
      ? this.state.tables.map((t) => (t.id === tableId ? { ...t, status: "on-dine" as TableStatus, seated: guests } : t))
      : this.state.tables;
    this.commit({ ...this.state, orders: [newOrder, ...this.state.orders], tables });
    return newOrder;
  }

  updateOrder(id: string, patch: Partial<Order>) {
    let updated: Order | null = null;
    const orders = this.state.orders.map((o) => {
      if (o.id !== id) return o;
      updated = { ...o, ...patch };
      return updated;
    });
    this.commit({ ...this.state, orders });
    return updated;
  }

  setOrderStatus(id: string, status: Order["status"]) {
    this.commit({ ...this.state, orders: this.state.orders.map((o) => (o.id === id ? { ...o, status } : o)) });
  }
}

export const persistedStore = new PersistedStore();
