import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/scope";
import { listCategories, listDishes } from "@/lib/data/menu";
import { listPrinters } from "@/lib/data/printers";
import { listInventoryItems } from "@/lib/data/inventory";
import { getRestaurant } from "@/lib/data/restaurants";
import { ManageDishesClient } from "./manage-dishes-client";

export default async function ManageDishesPage() {
  const { restaurantId } = await requirePermission("manage-dishes");

  const [categories, dishes, printers, inventoryItems, restaurant] = await Promise.all([
    listCategories(restaurantId),
    listDishes(restaurantId),
    listPrinters(restaurantId),
    listInventoryItems(restaurantId),
    getRestaurant(restaurantId),
  ]);

  return (
    <AppShell title="Manage Dishes">
      <ManageDishesClient
        categories={categories}
        dishes={dishes}
        printers={printers}
        inventoryItems={inventoryItems}
        currencySymbol={restaurant?.currencySymbol ?? "£"}
      />
    </AppShell>
  );
}
