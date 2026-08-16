import { AppShell } from "@/components/app-shell";
import { requireRestaurantContext } from "@/lib/scope";
import { listOrders } from "@/lib/data/orders";
import { KitchenClient } from "./kitchen-client";

export default async function KitchenPage() {
  const { restaurantId } = await requireRestaurantContext();
  const orders = await listOrders(restaurantId);

  return (
    <AppShell title="Kitchen Display">
      <KitchenClient orders={orders} />
    </AppShell>
  );
}
