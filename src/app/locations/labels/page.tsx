import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/scope";
import { listLocations } from "@/lib/data/locations";
import { LabelsClient } from "./labels-client";

export default async function BinLabelsPage() {
  const { restaurantId } = await requirePermission("locations");
  const locations = await listLocations(restaurantId);
  return (
    <AppShell title="Bin labels">
      <LabelsClient locations={locations.map((l) => ({ id: l.id, code: l.code, name: l.name }))} />
    </AppShell>
  );
}
