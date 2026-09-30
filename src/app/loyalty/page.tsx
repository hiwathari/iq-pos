import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/scope";
import { listLoyaltyMembers } from "@/lib/data/loyalty";
import { getRestaurant } from "@/lib/data/restaurants";
import { LoyaltyClient } from "./loyalty-client";

export default async function LoyaltyPage() {
  const { restaurantId } = await requirePermission("loyalty");
  const [members, restaurant] = await Promise.all([listLoyaltyMembers(restaurantId), getRestaurant(restaurantId)]);

  return (
    <AppShell title="Loyalty Cards">
      <LoyaltyClient members={members} restaurantSlug={restaurant?.slug ?? ""} />
    </AppShell>
  );
}
