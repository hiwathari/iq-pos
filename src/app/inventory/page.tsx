import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/scope";
import { listInventoryItems } from "@/lib/data/inventory";
import { InventoryClient } from "./inventory-client";

export default async function InventoryPage() {
  const { restaurantId } = await requirePermission("inventory");
  const items = await listInventoryItems(restaurantId);

  return (
    <AppShell title="Inventory">
      <InventoryClient items={items} />
    </AppShell>
  );
}
