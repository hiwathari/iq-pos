import { AppShell } from "@/components/app-shell";
import { assertAdmin, requireRestaurantContext } from "@/lib/scope";
import { listCategories, listDishes } from "@/lib/data/menu";
import { listPrinters } from "@/lib/data/printers";
import { getRestaurant } from "@/lib/data/restaurants";
import { ManageDishesClient } from "./manage-dishes-client";

export default async function ManageDishesPage() {
  const { session, restaurantId } = await requireRestaurantContext();
  assertAdmin(session);

  const [categories, dishes, printers, restaurant] = await Promise.all([
    listCategories(restaurantId),
    listDishes(restaurantId),
    listPrinters(restaurantId),
    getRestaurant(restaurantId),
  ]);

  return (
    <AppShell title="Manage Dishes">
      <ManageDishesClient
        categories={categories}
        dishes={dishes}
        printers={printers}
        currencySymbol={restaurant?.currencySymbol ?? "£"}
      />
    </AppShell>
  );
}
