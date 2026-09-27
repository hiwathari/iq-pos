import { AppShell } from "@/components/app-shell";
import { assertAdmin, requireRestaurantContext } from "@/lib/scope";
import { listLoyaltyMembers } from "@/lib/data/loyalty";
import { LoyaltyClient } from "./loyalty-client";

export default async function LoyaltyPage() {
  const { session, restaurantId } = await requireRestaurantContext();
  assertAdmin(session);
  const members = await listLoyaltyMembers(restaurantId);

  return (
    <AppShell title="Loyalty Cards">
      <LoyaltyClient members={members} />
    </AppShell>
  );
}
