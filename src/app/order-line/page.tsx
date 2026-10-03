import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/app-shell";
import { getUserPermissions, requirePermission } from "@/lib/scope";
import { hasPermission } from "@/lib/permissions";
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
  icons: { icon: "/api/pwa-icon/till?size=64", apple: "/api/pwa-icon/till?size=180" },
};

export const viewport: Viewport = { themeColor: "#0d9488" };

export default async function OrderLinePage() {
  const { session, restaurantId } = await requirePermission("order-line");

  const [categories, dishes, tables, orders, paymentTerminals, restaurant, permissions] = await Promise.all([
    listCategories(restaurantId),
    listDishes(restaurantId),
    listTables(restaurantId),
    listOrders(restaurantId),
    listPaymentTerminals(restaurantId),
    getRestaurant(restaurantId),
    session.role === "staff" ? getUserPermissions(session.userId) : Promise.resolve(null),
  ]);

  const currencySymbol = restaurant?.currencySymbol ?? "£";
  const restaurantName = restaurant?.name ?? "IQ POS";
  // Discounting an order's total is a manager-level call by default — Admin/Super/Regional Admin
  // always have it; a Staff login only gets it if explicitly granted the till-discount permission.
  const canDiscount = hasPermission(session.role, permissions, "till-discount");
  const taxEnabled = restaurant?.taxEnabled ?? false;

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
        canDiscount={canDiscount}
        taxEnabled={taxEnabled}
        invoiceAddress={restaurant?.invoiceAddress ?? undefined}
        invoicePhone={restaurant?.invoicePhone ?? undefined}
        invoiceWebsite={restaurant?.invoiceWebsite ?? undefined}
        invoiceLogoUrl={restaurant?.invoiceLogoUrl ?? undefined}
        invoiceFooterText={restaurant?.invoiceFooterText ?? "Thank you for dining with us!"}
        openTime={restaurant?.openTime ?? null}
        timezone={restaurant?.timezone ?? "UTC"}
      />
    </AppShell>
  );
}
