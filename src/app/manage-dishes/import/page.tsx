import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/scope";
import { getRestaurant } from "@/lib/data/restaurants";
import { businessProfile } from "@/lib/business-profile";
import { ImportClient } from "./import-client";

export default async function ImportProductsPage() {
  const { restaurantId } = await requirePermission("manage-dishes");
  const restaurant = await getRestaurant(restaurantId);
  const { words } = businessProfile(restaurant?.businessType, restaurant?.features);
  return (
    <AppShell title={`Import ${words.products}`}>
      <ImportClient productsWord={words.products} manageLabel={words.manageProducts} />
    </AppShell>
  );
}
