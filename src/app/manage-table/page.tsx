import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/scope";
import { listReservations, listTables } from "@/lib/data/tables";
import { getRestaurant } from "@/lib/data/restaurants";
import { tableQrToken } from "@/lib/table-qr-token";
import { ManageTableClient } from "./manage-table-client";

export default async function ManageTablePage() {
  const { restaurantId } = await requirePermission("manage-table");

  const [tables, reservations, restaurant] = await Promise.all([
    listTables(restaurantId),
    listReservations(restaurantId),
    getRestaurant(restaurantId),
  ]);

  // Each table's signed QR path (see lib/table-qr-token.ts) — signed here on the server, since the
  // signing key never reaches the browser.
  const slug = restaurant?.slug ?? "";
  const tableQrPaths = Object.fromEntries(tables.map((t) => [t.id, `/order/${slug}/table/${tableQrToken(restaurantId, t.id)}`]));

  return (
    <AppShell title="Manage Table">
      <ManageTableClient
        tables={tables}
        reservations={reservations}
        restaurantName={restaurant?.name ?? ""}
        tableQrPaths={tableQrPaths}
        qrTableOrderingEnabled={Boolean(restaurant?.onlineOrderingEnabled && restaurant?.qrTableOrderingEnabled)}
      />
    </AppShell>
  );
}
