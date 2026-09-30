import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/scope";
import { listDishes } from "@/lib/data/menu";
import { getRestaurant } from "@/lib/data/restaurants";
import { PricingClient } from "./pricing-client";

export default async function PricingPage() {
  const { restaurantId } = await requirePermission("pricing");
  const [dishes, restaurant] = await Promise.all([listDishes(restaurantId), getRestaurant(restaurantId)]);

  return (
    <AppShell title="Channel Pricing">
      <PricingClient dishes={dishes} currencySymbol={restaurant?.currencySymbol ?? "£"} />
    </AppShell>
  );
}
