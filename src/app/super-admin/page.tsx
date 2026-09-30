import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/scope";
import { listAssignedRestaurantIds, listRegionalAdmins, listRestaurantsWithStats, platformTotals } from "@/lib/data/restaurants";
import { SuperAdminClient } from "./super-admin-client";

export default async function SuperAdminPage() {
  const session = await requireSession();
  if (session.role !== "super_admin" && session.role !== "regional_admin") redirect("/dashboard");

  const isSuperAdmin = session.role === "super_admin";
  const assignedIds = isSuperAdmin ? undefined : await listAssignedRestaurantIds(session.userId);

  const [restaurants, totals, regionalAdmins] = await Promise.all([
    listRestaurantsWithStats(assignedIds),
    isSuperAdmin ? platformTotals() : Promise.resolve(null),
    isSuperAdmin ? listRegionalAdmins() : Promise.resolve([]),
  ]);

  return (
    <AppShell title="Super Admin">
      <SuperAdminClient
        restaurants={restaurants}
        totals={totals ?? { restaurantCount: restaurants.length, userCount: 0, orderCount: 0 }}
        isSuperAdmin={isSuperAdmin}
        regionalAdmins={regionalAdmins}
      />
    </AppShell>
  );
}
