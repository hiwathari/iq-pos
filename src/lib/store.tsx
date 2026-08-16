"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { Dish, Order, OrderChannel, OrderItem, OrderStatus, Reservation, TableStatus } from "./types";
import { persistedStore } from "./persisted-store";

interface CartState {
  editingOrderId: string | null;
  tableId: string | null;
  tableNumber: number | null;
  guests: number;
  channel: OrderChannel;
  items: OrderItem[];
}

const emptyCart: CartState = {
  editingOrderId: null,
  tableId: null,
  tableNumber: null,
  guests: 2,
  channel: "Dine in",
  items: [],
};

interface StoreValue {
  categories: ReturnType<typeof persistedStore.getSnapshot>["categories"];
  dishes: ReturnType<typeof persistedStore.getSnapshot>["dishes"];
  tables: ReturnType<typeof persistedStore.getSnapshot>["tables"];
  reservations: ReturnType<typeof persistedStore.getSnapshot>["reservations"];
  orders: ReturnType<typeof persistedStore.getSnapshot>["orders"];
  cart: CartState;

  addCategory: (name: string) => void;
  addDish: (dish: Omit<Dish, "id">) => void;
  updateDish: (id: string, patch: Partial<Dish>) => void;
  deleteDish: (id: string) => void;

  setTableStatus: (id: string, status: TableStatus, seated?: number) => void;
  addReservation: (r: Omit<Reservation, "id">) => void;

  addToCart: (dish: Dish) => void;
  incrementCartItem: (dishId: string) => void;
  decrementCartItem: (dishId: string) => void;
  removeCartItem: (dishId: string) => void;
  setCartTable: (tableId: string | null, tableNumber: number | null, guests: number) => void;
  setCartChannel: (channel: OrderChannel) => void;
  clearCart: () => void;
  loadOrderIntoCart: (orderId: string) => void;
  placeOrder: (paymentMethod?: Order["paymentMethod"]) => Order | null;
  setOrderStatus: (orderId: string, status: OrderStatus) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const state = useSyncExternalStore(
    persistedStore.subscribe,
    persistedStore.getSnapshot,
    persistedStore.getServerSnapshot
  );
  const [cart, setCart] = useState<CartState>(emptyCart);

  useEffect(() => {
    persistedStore.hydrateFromStorage();
  }, []);

  const addCategory = useCallback((name: string) => persistedStore.addCategory(name), []);
  const addDish = useCallback((dish: Omit<Dish, "id">) => persistedStore.addDish(dish), []);
  const updateDish = useCallback((id: string, patch: Partial<Dish>) => persistedStore.updateDish(id, patch), []);
  const deleteDish = useCallback((id: string) => persistedStore.deleteDish(id), []);
  const setTableStatus = useCallback(
    (id: string, status: TableStatus, seated?: number) => persistedStore.setTableStatus(id, status, seated),
    []
  );
  const addReservation = useCallback((r: Omit<Reservation, "id">) => persistedStore.addReservation(r), []);
  const setOrderStatus = useCallback((orderId: string, status: OrderStatus) => persistedStore.setOrderStatus(orderId, status), []);

  const addToCart = useCallback((dish: Dish) => {
    setCart((prev) => {
      const existing = prev.items.find((i) => i.dishId === dish.id);
      if (existing) {
        return { ...prev, items: prev.items.map((i) => (i.dishId === dish.id ? { ...i, qty: i.qty + 1 } : i)) };
      }
      return { ...prev, items: [...prev.items, { dishId: dish.id, name: dish.name, price: dish.price, qty: 1 }] };
    });
  }, []);

  const incrementCartItem = useCallback((dishId: string) => {
    setCart((prev) => ({ ...prev, items: prev.items.map((i) => (i.dishId === dishId ? { ...i, qty: i.qty + 1 } : i)) }));
  }, []);

  const decrementCartItem = useCallback((dishId: string) => {
    setCart((prev) => ({
      ...prev,
      items: prev.items.map((i) => (i.dishId === dishId ? { ...i, qty: i.qty - 1 } : i)).filter((i) => i.qty > 0),
    }));
  }, []);

  const removeCartItem = useCallback((dishId: string) => {
    setCart((prev) => ({ ...prev, items: prev.items.filter((i) => i.dishId !== dishId) }));
  }, []);

  const setCartTable = useCallback((tableId: string | null, tableNumber: number | null, guests: number) => {
    setCart((prev) => ({ ...prev, tableId, tableNumber, guests }));
  }, []);

  const setCartChannel = useCallback((channel: OrderChannel) => {
    setCart((prev) => ({ ...prev, channel }));
  }, []);

  const clearCart = useCallback(() => setCart(emptyCart), []);

  const loadOrderIntoCart = useCallback(
    (orderId: string) => {
      const order = state.orders.find((o) => o.id === orderId);
      if (!order) return;
      setCart({
        editingOrderId: order.id,
        tableId: order.tableId,
        tableNumber: order.tableNumber,
        guests: order.guests,
        channel: order.channel,
        items: order.items.map((i) => ({ ...i })),
      });
    },
    [state.orders]
  );

  const placeOrder = useCallback(
    (paymentMethod?: Order["paymentMethod"]) => {
      if (cart.items.length === 0) return null;

      if (cart.editingOrderId) {
        const updated = persistedStore.updateOrder(cart.editingOrderId, {
          tableId: cart.tableId,
          tableNumber: cart.tableNumber,
          guests: cart.guests,
          channel: cart.channel,
          items: cart.items,
          paymentMethod,
        });
        setCart(emptyCart);
        return updated;
      }

      const newOrder = persistedStore.addOrder(
        {
          tableId: cart.tableId,
          tableNumber: cart.tableNumber,
          guests: cart.guests,
          channel: cart.channel,
          status: cart.channel === "Wait List" ? "Wait List" : "In Kitchen",
          items: cart.items,
          paymentMethod,
        },
        cart.tableId,
        cart.guests
      );
      setCart(emptyCart);
      return newOrder;
    },
    [cart]
  );

  const value = useMemo<StoreValue>(
    () => ({
      categories: state.categories,
      dishes: state.dishes,
      tables: state.tables,
      reservations: state.reservations,
      orders: state.orders,
      cart,
      addCategory,
      addDish,
      updateDish,
      deleteDish,
      setTableStatus,
      addReservation,
      addToCart,
      incrementCartItem,
      decrementCartItem,
      removeCartItem,
      setCartTable,
      setCartChannel,
      clearCart,
      loadOrderIntoCart,
      placeOrder,
      setOrderStatus,
    }),
    [
      state,
      cart,
      addCategory,
      addDish,
      updateDish,
      deleteDish,
      setTableStatus,
      addReservation,
      addToCart,
      incrementCartItem,
      decrementCartItem,
      removeCartItem,
      setCartTable,
      setCartChannel,
      clearCart,
      loadOrderIntoCart,
      placeOrder,
      setOrderStatus,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
