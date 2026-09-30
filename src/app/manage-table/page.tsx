import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/scope";
import { listReservations, listTables } from "@/lib/data/tables";
import { getRestaurant } from "@/lib/data/restaurants";
import { ManageTableClient } from "./manage-table-client";

export default async function ManageTablePage() {
  const { restaurantId } = await requirePermission("manage-table");

  const [tables, reservations, restaurant] = await Promise.all([
    listTables(restaurantId),
    listReservations(restaurantId),
    getRestaurant(restaurantId),
  ]);

  return (
    <AppShell title="Manage Table">
      <ManageTableClient
        tables={tables}
        reservations={reservations}
        restaurantSlug={restaurant?.slug ?? ""}
        qrTableOrderingEnabled={restaurant?.qrTableOrderingEnabled ?? false}
      />
    </AppShell>
  );
}
