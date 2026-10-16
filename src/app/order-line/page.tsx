import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/app-shell";
import { getUserPermissions, requirePermission } from "@/lib/scope";
import { hasPermission } from "@/lib/permissions";
import { listCategories, listDishes } from "@/lib/data/menu";
import { listTables } from "@/lib/data/tables";
import { listOrders } from "@/lib/data/orders";
import { listPaymentTerminals, listPrinters } from "@/lib/data/printers";
import { getRestaurant } from "@/lib/data/restaurants";
import { hasKitchen } from "@/lib/types";
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

  const [categories, dishes, tables, orders, paymentTerminals, printers, restaurant, permissions] = await Promise.all([
    listCategories(restaurantId),
    listDishes(restaurantId),
    listTables(restaurantId),
    listOrders(restaurantId),
    listPaymentTerminals(restaurantId),
    listPrinters(restaurantId),
    getRestaurant(restaurantId),
    session.role === "staff" ? getUserPermissions(session.userId) : Promise.resolve(null),
  ]);

  const currencySymbol = restaurant?.currencySymbol ?? "£";
  const restaurantName = restaurant?.name ?? "IQ POS";
  // Discounting an order's total is a manager-level call by default — Admin/Super/Regional Admin
  // always have it; a Staff login only gets it if explicitly granted the till-discount permission.
  const canDiscount = hasPermission(session.role, permissions, "till-discount");
  const taxEnabled = restaurant?.taxEnabled ?? false;
  // The printer explicitly switched on as the Till's receipt printer (see
  // setTillReceiptPrinterAction) — deliberately NOT the same thing as the "Default" printer
  // (that flag routes new categories, unrelated to Till printing). Null for every restaurant that
  // hasn't turned this on, which keeps the original browser-print flow untouched either way —
  // see docs/DEVELOPER_GUIDE.md §7.8.
  const receiptPrinter = printers.find((p) => p.tillReceiptPrinter && p.active && p.localPrinterIp);
  const localPrintTarget = receiptPrinter
    ? { ip: receiptPrinter.localPrinterIp as string, port: receiptPrinter.localPrinterPort }
    : null;

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
        invoiceEmail={restaurant?.invoiceEmail ?? undefined}
        invoiceWebsite={restaurant?.invoiceWebsite ?? undefined}
        invoiceLogoUrl={restaurant?.invoiceLogoUrl ?? undefined}
        invoiceFooterText={restaurant?.invoiceFooterText ?? "Thank you for dining with us!"}
        openTime={restaurant?.openTime ?? null}
        timezone={restaurant?.timezone ?? "UTC"}
        localPrintTarget={localPrintTarget}
        staffName={session.name}
        hasKitchen={hasKitchen(printers)}
      />
    </AppShell>
  );
}
