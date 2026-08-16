import { AppShell } from "@/components/app-shell";
import { assertAdmin, requireRestaurantContext } from "@/lib/scope";
import { listDishes } from "@/lib/data/menu";
import { PricingClient } from "./pricing-client";

export default async function PricingPage() {
  const { session, restaurantId } = await requireRestaurantContext();
  assertAdmin(session);
  const dishes = await listDishes(restaurantId);

  return (
    <AppShell title="Channel Pricing">
      <PricingClient dishes={dishes} />
    </AppShell>
  );
}
