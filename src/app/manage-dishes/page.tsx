import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/scope";
import { listBarcodesByDish, listCategories, listDishes } from "@/lib/data/menu";
import { listPrinters } from "@/lib/data/printers";
import { listInventoryItems } from "@/lib/data/inventory";
import { listSuppliers } from "@/lib/data/suppliers";
import { getRestaurant } from "@/lib/data/restaurants";
import { ManageDishesClient } from "./manage-dishes-client";
import { businessProfile } from "@/lib/business-profile";

export default async function ManageDishesPage() {
  const { restaurantId } = await requirePermission("manage-dishes");

  const [categories, dishes, printers, inventoryItems, restaurant, barcodesByDish, suppliers] = await Promise.all([
    listCategories(restaurantId),
    listDishes(restaurantId),
    listPrinters(restaurantId),
    listInventoryItems(restaurantId),
    getRestaurant(restaurantId),
    listBarcodesByDish(restaurantId),
    listSuppliers(restaurantId),
  ]);

  const profile = businessProfile(restaurant?.businessType, restaurant?.features);
  const { words } = profile;

  return (
    <AppShell title={words.manageProducts}>
      <ManageDishesClient
        categories={categories}
        dishes={dishes}
        printers={printers}
        inventoryItems={inventoryItems}
        currencySymbol={restaurant?.currencySymbol ?? "£"}
        words={words}
        barcodesByDish={barcodesByDish}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
        isShop={!profile.features.kitchenDisplay && !profile.features.tables}
      />
    </AppShell>
  );
}
