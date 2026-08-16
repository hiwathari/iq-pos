import { AppShell } from "@/components/app-shell";
import { requireRestaurantContext } from "@/lib/scope";
import { listCategories, listDishes } from "@/lib/data/menu";
import { listTables } from "@/lib/data/tables";
import { listOrders } from "@/lib/data/orders";
import { OrderLineClient } from "./order-line-client";

export default async function OrderLinePage() {
  const { restaurantId } = await requireRestaurantContext();

  const [categories, dishes, tables, orders] = await Promise.all([
    listCategories(restaurantId),
    listDishes(restaurantId),
    listTables(restaurantId),
    listOrders(restaurantId),
  ]);

  return (
    <AppShell title="Order Line">
      <OrderLineClient categories={categories} dishes={dishes} tables={tables} orders={orders} />
    </AppShell>
  );
}
