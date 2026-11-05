import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/scope";
import { listTransfersFor } from "@/lib/data/transfers";
import { listAccessibleSites } from "@/lib/data/sites";
import { listStockRows } from "@/lib/data/stock";
import { TransfersClient } from "./transfers-client";

export default async function TransfersPage() {
  const { session, restaurantId } = await requirePermission("transfers");
  const [transfers, sites, items] = await Promise.all([listTransfersFor(restaurantId), listAccessibleSites(session), listStockRows(restaurantId)]);
  return (
    <AppShell title="Transfers">
      <TransfersClient
        transfers={transfers.map((t) => ({ id: t.id, number: t.number, status: t.status, direction: t.direction, fromName: t.fromName, toName: t.toName, createdAt: t.createdAt, lines: t.lines }))}
        otherSites={sites.filter((s) => s.id !== restaurantId).map((s) => ({ id: s.id, name: s.name }))}
        items={items.map((i) => ({ id: i.id, name: i.name, unit: i.unit, quantity: i.quantity, sku: i.sku, barcodes: i.packBarcodes }))}
      />
    </AppShell>
  );
}
