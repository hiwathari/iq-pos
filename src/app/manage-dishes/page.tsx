import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/scope";
import { listCategories, listDishes } from "@/lib/data/menu";
import { listPrinters } from "@/lib/data/printers";
import { listInventoryItems } from "@/lib/data/inventory";
import { getRestaurant } from "@/lib/data/restaurants";
import { ManageDishesClient } from "./manage-dishes-client";
import { businessProfile } from "@/lib/business-profile";

export default async function ManageDishesPage() {
  const { restaurantId } = await requirePermission("manage-dishes");

  const [categories, dishes, printers, inventoryItems, restaurant] = await Promise.all([
    listCategories(restaurantId),
    listDishes(restaurantId),
    listPrinters(restaurantId),
    listInventoryItems(restaurantId),
    getRestaurant(restaurantId),
  ]);

  const { words } = businessProfile(restaurant?.businessType, restaurant?.features);

  return (
    <AppShell title={words.manageProducts}>
      <ManageDishesClient
        categories={categories}
        dishes={dishes}
        printers={printers}
        inventoryItems={inventoryItems}
        currencySymbol={restaurant?.currencySymbol ?? "£"}
        words={words}
      />
    </AppShell>
  );
}
