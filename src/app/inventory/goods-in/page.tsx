import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/scope";
import { listStockRows } from "@/lib/data/stock";
import { listSuppliers } from "@/lib/data/suppliers";
import { getPurchaseOrder } from "@/lib/data/purchase-orders";
import { getRestaurant } from "@/lib/data/restaurants";
import { GoodsInClient } from "./goods-in-client";

export default async function GoodsInPage({ searchParams }: { searchParams: Promise<{ po?: string }> }) {
  const { restaurantId } = await requirePermission("inventory");
  const { po: poId } = await searchParams;
  const [items, suppliers, restaurant, po] = await Promise.all([
    listStockRows(restaurantId),
    listSuppliers(restaurantId),
    getRestaurant(restaurantId),
    poId ? getPurchaseOrder(restaurantId, poId) : null,
  ]);

  return (
    <AppShell title="Goods in">
      <GoodsInClient
        items={items.map((i) => ({ id: i.id, name: i.name, unit: i.unit, sku: i.sku, costPrice: i.costPrice, supplierId: i.supplierId, barcodes: i.packBarcodes }))}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
        currencySymbol={restaurant?.currencySymbol ?? "£"}
        order={
          po && po.status !== "cancelled" && po.status !== "received"
            ? {
                id: po.id,
                number: po.number,
                supplierId: po.supplierId,
                lines: po.lines.map((l) => ({ itemId: l.inventoryItemId, qty: Math.max(0, Math.round((l.qtyOrdered - l.qtyReceived) * 1000) / 1000), cost: l.unitCost })),
              }
            : null
        }
      />
    </AppShell>
  );
}
