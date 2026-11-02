import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/scope";
import { listSuppliersWithCounts } from "@/lib/data/suppliers";
import { getRestaurant } from "@/lib/data/restaurants";
import { SuppliersClient } from "./suppliers-client";

export default async function SuppliersPage() {
  const { restaurantId } = await requirePermission("suppliers");
  const [suppliers, restaurant] = await Promise.all([listSuppliersWithCounts(restaurantId), getRestaurant(restaurantId)]);
  return (
    <AppShell title="Suppliers">
      <SuppliersClient suppliers={suppliers} currencySymbol={restaurant?.currencySymbol ?? "£"} />
    </AppShell>
  );
}
