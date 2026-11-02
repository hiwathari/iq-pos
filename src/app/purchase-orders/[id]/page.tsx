import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/scope";
import { listStockRows } from "@/lib/data/stock";
import { listSuppliers } from "@/lib/data/suppliers";
import { getPurchaseOrder } from "@/lib/data/purchase-orders";
import { getRestaurant } from "@/lib/data/restaurants";
import { PurchaseOrderClient } from "./purchase-order-client";

export default async function PurchaseOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ supplier?: string }> }) {
  const { restaurantId } = await requirePermission("purchase-orders");
  const { id } = await params;
  const { supplier } = await searchParams;
  const [items, suppliers, restaurant, po] = await Promise.all([
    listStockRows(restaurantId),
    listSuppliers(restaurantId),
    getRestaurant(restaurantId),
    id === "new" ? null : getPurchaseOrder(restaurantId, id),
  ]);
  if (id !== "new" && !po) notFound();

  return (
    <AppShell title={po ? po.number : "New purchase order"}>
      <PurchaseOrderClient
        order={po}
        initialSupplierId={po?.supplierId ?? supplier ?? ""}
        items={items.map((i) => ({ id: i.id, name: i.name, unit: i.unit, sku: i.sku, costPrice: i.costPrice, supplierId: i.supplierId, barcodes: i.packBarcodes, quantity: i.quantity }))}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, email: s.email }))}
        currencySymbol={restaurant?.currencySymbol ?? "£"}
      />
    </AppShell>
  );
}
