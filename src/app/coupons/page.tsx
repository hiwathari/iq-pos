import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/scope";
import { listCoupons } from "@/lib/data/coupons";
import { getRestaurant } from "@/lib/data/restaurants";
import { CouponsClient } from "./coupons-client";

export default async function CouponsPage() {
  const { restaurantId } = await requirePermission("coupons");
  const [coupons, restaurant] = await Promise.all([listCoupons(restaurantId), getRestaurant(restaurantId)]);

  return (
    <AppShell title="Coupons">
      <CouponsClient coupons={coupons} currencySymbol={restaurant?.currencySymbol ?? "£"} />
    </AppShell>
  );
}
