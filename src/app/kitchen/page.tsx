import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/scope";
import { listOrders } from "@/lib/data/orders";
import { listCategories, listDishes } from "@/lib/data/menu";
import { listPrinters } from "@/lib/data/printers";
import { getRestaurant } from "@/lib/data/restaurants";
import { listInventoryItems } from "@/lib/data/inventory";
import { KitchenClient } from "./kitchen-client";

export const metadata: Metadata = {
  title: "Kitchen",
  manifest: "/kitchen-manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Kitchen" },
  icons: { icon: "/api/pwa-icon/kitchen?size=64", apple: "/api/pwa-icon/kitchen?size=180" },
};

export const viewport: Viewport = { themeColor: "#d97706" };

export default async function KitchenPage() {
  const { session, restaurantId } = await requirePermission("kitchen");
  const [orders, categories, dishes, printers, restaurant, stockItems] = await Promise.all([
    listOrders(restaurantId),
    listCategories(restaurantId),
    listDishes(restaurantId),
    listPrinters(restaurantId),
    getRestaurant(restaurantId),
    listInventoryItems(restaurantId),
  ]);
  // Each counted product's own stock item (the Stock panel's numbers).
  const stockCounts: Record<string, { qty: number; unit: string }> = {};
  for (const item of stockItems) if (item.dishId && !item.variantId) stockCounts[item.dishId] = { qty: item.quantity, unit: item.unit };

  return (
    <AppShell title="Kitchen Display" till>
      <KitchenClient
        orders={orders}
        categories={categories}
        dishes={dishes}
        stockCounts={stockCounts}
        printers={printers}
        timerLimitMinutes={restaurant?.kitchenTimerLimitMinutes ?? 30}
        openTime={restaurant?.openTime ?? null}
        timezone={restaurant?.timezone ?? "UTC"}
        defaultStation={session.displayStation ?? null}
      />
    </AppShell>
  );
}
