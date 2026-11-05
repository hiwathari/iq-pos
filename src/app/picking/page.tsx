import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/scope";
import { listPickOrders } from "@/lib/data/picking";
import { listBarcodesByDish } from "@/lib/data/menu";
import { getRestaurant } from "@/lib/data/restaurants";
import { PickingClient } from "./picking-client";

export default async function PickingPage() {
  const { restaurantId } = await requirePermission("picking");
  const [pickOrders, barcodes, restaurant] = await Promise.all([listPickOrders(restaurantId), listBarcodesByDish(restaurantId), getRestaurant(restaurantId)]);
  return (
    <AppShell title="Picking">
      <PickingClient
        orders={pickOrders}
        barcodesByDish={barcodes}
        business={{ name: restaurant?.name ?? "", address: restaurant?.invoiceAddress ?? null, phone: restaurant?.invoicePhone ?? null }}
      />
    </AppShell>
  );
}
