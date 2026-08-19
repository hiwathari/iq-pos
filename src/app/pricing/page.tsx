import { AppShell } from "@/components/app-shell";
import { assertAdmin, requireRestaurantContext } from "@/lib/scope";
import { listDishes } from "@/lib/data/menu";
import { getRestaurant } from "@/lib/data/restaurants";
import { PricingClient } from "./pricing-client";

export default async function PricingPage() {
  const { session, restaurantId } = await requireRestaurantContext();
  assertAdmin(session);
  const [dishes, restaurant] = await Promise.all([listDishes(restaurantId), getRestaurant(restaurantId)]);

  return (
    <AppShell title="Channel Pricing">
      <PricingClient dishes={dishes} currencySymbol={restaurant?.currencySymbol ?? "£"} />
    </AppShell>
  );
}
