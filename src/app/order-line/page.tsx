import { AppShell } from "@/components/app-shell";
import { requireRestaurantContext } from "@/lib/scope";
import { listCategories, listDishes } from "@/lib/data/menu";
import { listTables } from "@/lib/data/tables";
import { listOrders } from "@/lib/data/orders";
import { listPaymentTerminals } from "@/lib/data/printers";
import { getRestaurant } from "@/lib/data/restaurants";
import { OrderLineClient } from "./order-line-client";

export default async function OrderLinePage() {
  const { restaurantId } = await requireRestaurantContext();

  const [categories, dishes, tables, orders, paymentTerminals, restaurant] = await Promise.all([
    listCategories(restaurantId),
    listDishes(restaurantId),
    listTables(restaurantId),
    listOrders(restaurantId),
    listPaymentTerminals(restaurantId),
    getRestaurant(restaurantId),
  ]);

  return (
    <AppShell title="Till">
      <OrderLineClient
        categories={categories}
        dishes={dishes}
        tables={tables}
        orders={orders}
        paymentTerminals={paymentTerminals.filter((t) => t.active)}
        currencySymbol={restaurant?.currencySymbol ?? "£"}
      />
    </AppShell>
  );
}
