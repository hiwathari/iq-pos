import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/scope";
import { listStockRows } from "@/lib/data/stock";
import { listSuppliers } from "@/lib/data/suppliers";
import { listCategories } from "@/lib/data/menu";
import { InventoryClient } from "./inventory-client";
import { listAccessibleSites } from "@/lib/data/sites";
import { getRestaurant } from "@/lib/data/restaurants";
import { businessProfile } from "@/lib/business-profile";

export default async function InventoryPage() {
  const { session, restaurantId } = await requirePermission("inventory");
  const [items, restaurant, suppliers, categories] = await Promise.all([
    listStockRows(restaurantId),
    getRestaurant(restaurantId),
    listSuppliers(restaurantId),
    listCategories(restaurantId),
  ]);
  const profile = businessProfile(restaurant?.businessType, restaurant?.features);

  return (
    <AppShell title={profile.features.purchasing ? "Stock" : "Inventory"}>
      <InventoryClient
        items={items}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        productWord={profile.words.product.toLowerCase()}
        purchasing={profile.features.purchasing}
        features={profile.features}
        canTransfer={(await listAccessibleSites(session)).length > 1}
        currencySymbol={restaurant?.currencySymbol ?? "£"}
      />
    </AppShell>
  );
}
