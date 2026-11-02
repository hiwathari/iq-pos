import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/scope";
import { listReorderSuggestions } from "@/lib/data/stock";
import { getRestaurant } from "@/lib/data/restaurants";
import { ReorderClient } from "./reorder-client";

export default async function ReorderPage() {
  const { restaurantId } = await requirePermission("inventory");
  const [rows, restaurant] = await Promise.all([listReorderSuggestions(restaurantId), getRestaurant(restaurantId)]);
  return (
    <AppShell title="Reorder">
      <ReorderClient rows={rows} currencySymbol={restaurant?.currencySymbol ?? "£"} />
    </AppShell>
  );
}
