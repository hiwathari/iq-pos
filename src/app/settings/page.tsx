import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/scope";
import { listStaff } from "@/lib/data/staff";
import { getRestaurant } from "@/lib/data/restaurants";
import { listIntegrations, listPaymentTerminals, listPrinters } from "@/lib/data/printers";
import { StaffClient } from "./staff-client";
import { PrintersClient } from "./printers-client";
import { PaymentTerminalsClient } from "./payment-terminals-client";
import { IntegrationsClient } from "./integrations-client";
import { RestaurantClient } from "./restaurant-client";
import { InvoiceDetailsClient } from "./invoice-details-client";

export default async function SettingsPage() {
  const { restaurantId } = await requirePermission("settings");

  const [staff, restaurant, printers, paymentTerminals, integrations] = await Promise.all([
    listStaff(restaurantId),
    getRestaurant(restaurantId),
    listPrinters(restaurantId),
    listPaymentTerminals(restaurantId),
    listIntegrations(restaurantId),
  ]);

  return (
    <AppShell title="Settings">
      <div className="space-y-8 p-6">
        <div>
          <h1 className="mb-1 text-xl font-semibold text-neutral-900">Settings</h1>
          <p className="text-sm text-neutral-500">{restaurant?.name ?? "Restaurant"}</p>
        </div>

        <RestaurantClient
          currencySymbol={restaurant?.currencySymbol ?? "£"}
          kitchenTimerLimitMinutes={restaurant?.kitchenTimerLimitMinutes ?? 30}
          taxEnabled={restaurant?.taxEnabled ?? false}
          businessType={restaurant?.businessType ?? "restaurant"}
          openTime={restaurant?.openTime ?? null}
          closeTime={restaurant?.closeTime ?? null}
        />
        <div className="border-t border-neutral-100 pt-8">
          <InvoiceDetailsClient
            invoiceAddress={restaurant?.invoiceAddress ?? ""}
            invoicePhone={restaurant?.invoicePhone ?? ""}
            invoiceWebsite={restaurant?.invoiceWebsite ?? ""}
            invoiceLogoUrl={restaurant?.invoiceLogoUrl ?? ""}
            invoiceFooterText={restaurant?.invoiceFooterText ?? "Thank you for dining with us!"}
          />
        </div>
        <div className="border-t border-neutral-100 pt-8">
          <StaffClient staff={staff} />
        </div>
        <div className="border-t border-neutral-100 pt-8">
          <PrintersClient printers={printers} />
        </div>
        <div className="border-t border-neutral-100 pt-8">
          <PaymentTerminalsClient terminals={paymentTerminals} />
        </div>
        <div className="border-t border-neutral-100 pt-8">
          <IntegrationsClient integrations={integrations} />
        </div>
      </div>
    </AppShell>
  );
}
