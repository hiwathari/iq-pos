import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/app-shell";
import { requireRestaurantContext } from "@/lib/scope";
import { listCategories, listDishes } from "@/lib/data/menu";
import { listTables } from "@/lib/data/tables";
import { listOrders } from "@/lib/data/orders";
import { listPaymentTerminals } from "@/lib/data/printers";
import { getRestaurant } from "@/lib/data/restaurants";
import { TillModeSwitcher } from "./till-mode-switcher";

export const metadata: Metadata = {
  title: "Till",
  manifest: "/till-manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Till" },
  icons: { apple: "/api/pwa-icon/till?size=180" },
};

export const viewport: Viewport = { themeColor: "#0d9488" };

export default async function OrderLinePage() {
  const { restaurantId } = await requireRestaurantContext();

  const [categories, dishes, tables, orders, paymentTerminals, restaurant] = await Promise.all([
    listCategories(restaurantId),
    listDishes(restaurantId),
    listTables(restaurantId),
    listOrders(restaurantId),
    listPaymentTerminals(restaurantId),
    getRestaurant(restaurantId),
  ]);

  const currencySymbol = restaurant?.currencySymbol ?? "£";
  const restaurantName = restaurant?.name ?? "IQ POS";

  return (
    <AppShell title="Till">
      <TillModeSwitcher
        categories={categories}
        dishes={dishes}
        tables={tables}
        orders={orders}
        paymentTerminals={paymentTerminals.filter((t) => t.active)}
        currencySymbol={currencySymbol}
        restaurantName={restaurantName}
        invoiceAddress={restaurant?.invoiceAddress ?? undefined}
        invoicePhone={restaurant?.invoicePhone ?? undefined}
        invoiceWebsite={restaurant?.invoiceWebsite ?? undefined}
        invoiceLogoUrl={restaurant?.invoiceLogoUrl ?? undefined}
        invoiceFooterText={restaurant?.invoiceFooterText ?? "Thank you for dining with us!"}
      />
    </AppShell>
  );
}
