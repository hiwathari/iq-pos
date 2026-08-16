import { AppShell } from "@/components/app-shell";
import { assertAdmin, requireRestaurantContext } from "@/lib/scope";
import { listStaff } from "@/lib/data/staff";
import { getRestaurant } from "@/lib/data/restaurants";
import { StaffClient } from "./staff-client";

export default async function SettingsPage() {
  const { session, restaurantId } = await requireRestaurantContext();
  assertAdmin(session);

  const [staff, restaurant] = await Promise.all([listStaff(restaurantId), getRestaurant(restaurantId)]);

  return (
    <AppShell title="Settings">
      <StaffClient staff={staff} restaurantName={restaurant?.name ?? "Restaurant"} />
    </AppShell>
  );
}
