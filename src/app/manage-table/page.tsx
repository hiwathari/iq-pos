import { AppShell } from "@/components/app-shell";
import { requireRestaurantContext } from "@/lib/scope";
import { listReservations, listTables } from "@/lib/data/tables";
import { ManageTableClient } from "./manage-table-client";

export default async function ManageTablePage() {
  const { restaurantId } = await requireRestaurantContext();

  const [tables, reservations] = await Promise.all([listTables(restaurantId), listReservations(restaurantId)]);

  return (
    <AppShell title="Manage Table">
      <ManageTableClient tables={tables} reservations={reservations} />
    </AppShell>
  );
}
