import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/scope";
import { listInventoryItems } from "@/lib/data/inventory";
import { InventoryClient } from "./inventory-client";
import { getRestaurant } from "@/lib/data/restaurants";
import { businessProfile } from "@/lib/business-profile";

export default async function InventoryPage() {
  const { restaurantId } = await requirePermission("inventory");
  const [items, restaurant] = await Promise.all([listInventoryItems(restaurantId), getRestaurant(restaurantId)]);
  const { words } = businessProfile(restaurant?.businessType, restaurant?.features);

  return (
    <AppShell title="Inventory">
      <InventoryClient items={items} productWord={words.product.toLowerCase()} />
    </AppShell>
  );
}
