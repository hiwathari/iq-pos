import { AppShell } from "@/components/app-shell";
import { assertAdmin, requireRestaurantContext } from "@/lib/scope";
import { listStaff } from "@/lib/data/staff";
import { getRestaurant } from "@/lib/data/restaurants";
import { listIntegrations, listPrinters } from "@/lib/data/printers";
import { StaffClient } from "./staff-client";
import { PrintersClient } from "./printers-client";
import { IntegrationsClient } from "./integrations-client";

export default async function SettingsPage() {
  const { session, restaurantId } = await requireRestaurantContext();
  assertAdmin(session);

  const [staff, restaurant, printers, integrations] = await Promise.all([
    listStaff(restaurantId),
    getRestaurant(restaurantId),
    listPrinters(restaurantId),
    listIntegrations(restaurantId),
  ]);

  return (
    <AppShell title="Settings">
      <div className="space-y-8 p-6">
        <div>
          <h1 className="mb-1 text-xl font-semibold text-neutral-900">Settings</h1>
          <p className="text-sm text-neutral-500">{restaurant?.name ?? "Restaurant"}</p>
        </div>

        <StaffClient staff={staff} />
        <div className="border-t border-neutral-100 pt-8">
          <PrintersClient printers={printers} />
        </div>
        <div className="border-t border-neutral-100 pt-8">
          <IntegrationsClient integrations={integrations} />
        </div>
      </div>
    </AppShell>
  );
}
