import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/app-shell";
import { getUserPermissions, requirePermission } from "@/lib/scope";
import { hasPermission } from "@/lib/permissions";
import { listCategories, listDishes } from "@/lib/data/menu";
import { listTables } from "@/lib/data/tables";
import { listOrders } from "@/lib/data/orders";
import { listPaymentTerminals, listPrinters } from "@/lib/data/printers";
import { getRestaurant } from "@/lib/data/restaurants";
import { businessProfile } from "@/lib/business-profile";
import { listBarcodesByDish } from "@/lib/data/menu";
import { listRefundsBetween, refundsByTender } from "@/lib/data/refunds";
import { listInventoryItems } from "@/lib/data/inventory";
import { DEFAULT_EMBEDDED_FORMATS } from "@/lib/barcode";
import { hasKitchen, salesByTender } from "@/lib/types";
import { businessDayStart } from "@/lib/business-day";
import { TodaySales } from "@/components/today-sales";
import { TillModeSwitcher } from "./till-mode-switcher";

export const metadata: Metadata = {
  title: "Till",
  manifest: "/till-manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Till" },
  icons: { icon: "/api/pwa-icon/till?size=64", apple: "/api/pwa-icon/till?size=180" },
};

export const viewport: Viewport = { themeColor: "#0d9488" };

// Top-level wrapper around Date.now() so the page component itself stays free of impure calls
// (react-hooks purity lint rule) — same pattern as dashboard/page.tsx.
function currentBusinessDayStart(openTime: string | null, timezone: string) {
  return businessDayStart(Date.now(), openTime, timezone);
}

export default async function OrderLinePage() {
  const { session, restaurantId } = await requirePermission("order-line");

  const [categories, dishes, tables, orders, paymentTerminals, printers, restaurant, permissions, barcodesByDish, stockItems] = await Promise.all([
    listCategories(restaurantId),
    listDishes(restaurantId),
    listTables(restaurantId),
    listOrders(restaurantId),
    listPaymentTerminals(restaurantId),
    listPrinters(restaurantId),
    getRestaurant(restaurantId),
    session.role === "staff" ? getUserPermissions(session.userId) : Promise.resolve(null),
    listBarcodesByDish(restaurantId),
    listInventoryItems(restaurantId),
  ]);
  // "12 left" on Till tiles (docs/retail-plan step 3.8): only for products with their own stock.
  const stockByDish: Record<string, { qty: number; low: number; unit: string }> = {};
  for (const item of stockItems) {
    if (item.dishId) stockByDish[item.dishId] = { qty: item.quantity, low: item.lowStockThreshold, unit: item.unit };
  }

  const currencySymbol = restaurant?.currencySymbol ?? "£";
  const restaurantName = restaurant?.name ?? "IQ POS";
  const profile = businessProfile(restaurant?.businessType, restaurant?.features);
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

  // Today's takings so far — orders placed since this business day began. The Till refreshes
  // every 20s (router.refresh), which re-renders this, so the figures keep up during service.
  const dayStart = currentBusinessDayStart(restaurant?.openTime ?? null, restaurant?.timezone ?? "UTC");
  const todaySales = salesByTender(orders.filter((o) => o.createdAt >= dayStart));
  // Refunds given today come off today's figures (docs/retail-plan step 3.7).
  const todayRefunds = refundsByTender(await listRefundsBetween(restaurantId, dayStart, Number.MAX_SAFE_INTEGER));
  const today = { cash: todaySales.cash - todayRefunds.cash, card: todaySales.card - todayRefunds.card };

  return (
    <AppShell title="Till" headerExtra={<TodaySales cash={today.cash} card={today.card} currencySymbol={currencySymbol} />}>
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
        invoiceFooterText={restaurant?.invoiceFooterText ?? profile.receiptFooter}
        openTime={restaurant?.openTime ?? null}
        timezone={restaurant?.timezone ?? "UTC"}
        localPrintTarget={localPrintTarget}
        staffName={session.name}
        hasKitchen={profile.features.kitchenDisplay && hasKitchen(printers)}
        channels={profile.channels}
        showTables={profile.features.tables}
        barcodesByDish={barcodesByDish}
        embeddedFormats={restaurant?.embeddedBarcodes ?? DEFAULT_EMBEDDED_FORMATS}
        stockByDish={stockByDish}
        stockMode={restaurant?.negativeStock ?? "allow"}
        canOverridePrice={hasPermission(session.role, permissions, "till-price-override")}
        canAddProducts={hasPermission(session.role, permissions, "manage-dishes")}
        canRefund={hasPermission(session.role, permissions, "till-refund")}
      />
    </AppShell>
  );
}
