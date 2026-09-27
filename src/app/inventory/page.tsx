import { AppShell } from "@/components/app-shell";
import { assertAdmin, requireRestaurantContext } from "@/lib/scope";
import { listInventoryItems } from "@/lib/data/inventory";
import { InventoryClient } from "./inventory-client";

export default async function InventoryPage() {
  const { session, restaurantId } = await requireRestaurantContext();
  assertAdmin(session);
  const items = await listInventoryItems(restaurantId);

  return (
    <AppShell title="Inventory">
      <InventoryClient items={items} />
    </AppShell>
  );
}
