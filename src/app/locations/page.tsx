import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/scope";
import { listLocationContents, listLocations } from "@/lib/data/locations";
import { listStockRows } from "@/lib/data/stock";
import { LocationsClient } from "./locations-client";

export default async function LocationsPage() {
  const { restaurantId } = await requirePermission("locations");
  const [locations, contents, items] = await Promise.all([listLocations(restaurantId), listLocationContents(restaurantId), listStockRows(restaurantId)]);
  const inBins = new Map<string, number>();
  for (const list of Object.values(contents)) for (const c of list) inBins.set(c.itemId, (inBins.get(c.itemId) ?? 0) + c.quantity);
  return (
    <AppShell title="Locations">
      <LocationsClient
        locations={locations.map((l) => ({ id: l.id, code: l.code, name: l.name, kind: l.kind, parentId: l.parentId, pickable: l.pickable, sort: l.sort }))}
        contents={contents}
        items={items.map((i) => ({ id: i.id, name: i.name, unit: i.unit, quantity: i.quantity, unallocated: Math.max(0, Math.round((i.quantity - (inBins.get(i.id) ?? 0)) * 1000) / 1000) }))}
      />
    </AppShell>
  );
}
