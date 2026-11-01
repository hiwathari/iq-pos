import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/scope";
import { getRestaurant } from "@/lib/data/restaurants";
import { listBarcodesByDish, listCategories, listDishes } from "@/lib/data/menu";
import { businessProfile } from "@/lib/business-profile";
import { LabelsClient } from "./labels-client";

export default async function LabelsPage() {
  const { restaurantId } = await requirePermission("manage-dishes");
  const [restaurant, dishes, categories, barcodesByDish] = await Promise.all([
    getRestaurant(restaurantId),
    listDishes(restaurantId),
    listCategories(restaurantId),
    listBarcodesByDish(restaurantId),
  ]);
  const { words } = businessProfile(restaurant?.businessType, restaurant?.features);
  return (
    <AppShell title="Labels">
      <LabelsClient
        dishes={dishes}
        categories={categories}
        barcodesByDish={barcodesByDish}
        currencySymbol={restaurant?.currencySymbol ?? "£"}
        manageLabel={words.manageProducts}
      />
    </AppShell>
  );
}
