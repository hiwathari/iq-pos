import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/scope";
import { expiringBatches } from "@/lib/data/locations";
import { getRestaurant } from "@/lib/data/restaurants";
import { ExpiryClient } from "./expiry-client";

export default async function ExpiryPage() {
  const { restaurantId } = await requirePermission("inventory");
  const [rows, restaurant] = await Promise.all([expiringBatches(restaurantId), getRestaurant(restaurantId)]);
  return (
    <AppShell title="Expiry">
      <ExpiryClient rows={rows} currencySymbol={restaurant?.currencySymbol ?? "£"} timezone={restaurant?.timezone ?? "UTC"} />
    </AppShell>
  );
}
