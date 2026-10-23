import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/scope";
import { getAccountsLogin, listStaff } from "@/lib/data/staff";
import { getRestaurant } from "@/lib/data/restaurants";
import { listIntegrations, listPaymentTerminals, listPrinters } from "@/lib/data/printers";
import { StaffClient } from "./staff-client";
import { PrintersClient } from "./printers-client";
import { PrinterSetupGuide } from "@/components/printer-setup-guide";
import { PaymentTerminalsClient } from "./payment-terminals-client";
import { IntegrationsClient } from "./integrations-client";
import { RestaurantClient } from "./restaurant-client";
import { InvoiceDetailsClient } from "./invoice-details-client";
import { AccountsLoginClient } from "./accounts-login-client";

export default async function SettingsPage() {
  const { session, restaurantId } = await requirePermission("settings");

  const [staff, accountsLogin, restaurant, printers, paymentTerminals, integrations] = await Promise.all([
    listStaff(restaurantId),
    getAccountsLogin(restaurantId),
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
          businessType={restaurant?.businessType ?? "restaurant"}
          currencySymbol={restaurant?.currencySymbol ?? "£"}
          kitchenTimerLimitMinutes={restaurant?.kitchenTimerLimitMinutes ?? 30}
          taxEnabled={restaurant?.taxEnabled ?? false}
          openTime={restaurant?.openTime ?? null}
          closeTime={restaurant?.closeTime ?? null}
          timezone={restaurant?.timezone ?? "UTC"}
        />
        <div className="border-t border-neutral-100 pt-8">
          <InvoiceDetailsClient
            invoiceAddress={restaurant?.invoiceAddress ?? ""}
            invoicePhone={restaurant?.invoicePhone ?? ""}
            invoiceEmail={restaurant?.invoiceEmail ?? ""}
            invoiceWebsite={restaurant?.invoiceWebsite ?? ""}
            invoiceLogoUrl={restaurant?.invoiceLogoUrl ?? ""}
            invoiceFooterText={restaurant?.invoiceFooterText ?? "Thank you for dining with us!"}
          />
        </div>
        <div className="border-t border-neutral-100 pt-8">
          <StaffClient staff={staff} />
        </div>
        <div className="border-t border-neutral-100 pt-8">
          <AccountsLoginClient
            accountsLogin={accountsLogin}
            canManage={session.role !== "staff" && session.role !== "accounts"}
          />
        </div>
        <div className="border-t border-neutral-100 pt-8">
          <PrintersClient printers={printers} />
          <details className="mt-5 rounded-2xl border border-neutral-200 bg-white p-4 [&_summary::-webkit-details-marker]:hidden">
            <summary className="cursor-pointer list-none text-sm font-semibold text-neutral-900">Printer setup kit — steps, scripts and downloads</summary>
            <div className="mt-4">
              <PrinterSetupGuide />
            </div>
          </details>
        </div>
        <div className="border-t border-neutral-100 pt-8">
          <PaymentTerminalsClient
            terminals={paymentTerminals}
            sumupApiKey={restaurant?.sumupApiKey ?? ""}
            sumupMerchantCode={restaurant?.sumupMerchantCode ?? ""}
            teyaClientId={restaurant?.teyaClientId ?? ""}
            teyaClientSecret={restaurant?.teyaClientSecret ?? ""}
            teyaStoreId={restaurant?.teyaStoreId ?? ""}
          />
        </div>
        <div className="border-t border-neutral-100 pt-8">
          <IntegrationsClient integrations={integrations} />
        </div>
      </div>
    </AppShell>
  );
}
