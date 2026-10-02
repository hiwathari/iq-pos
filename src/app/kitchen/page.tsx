import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/scope";
import { listOrders } from "@/lib/data/orders";
import { listCategories, listDishes } from "@/lib/data/menu";
import { listPrinters } from "@/lib/data/printers";
import { getRestaurant } from "@/lib/data/restaurants";
import { KitchenClient } from "./kitchen-client";

export const metadata: Metadata = {
  title: "Kitchen",
  manifest: "/kitchen-manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Kitchen" },
  icons: { apple: "/api/pwa-icon/kitchen?size=180" },
};

export const viewport: Viewport = { themeColor: "#d97706" };

export default async function KitchenPage() {
  const { session, restaurantId } = await requirePermission("kitchen");
  const [orders, categories, dishes, printers, restaurant] = await Promise.all([
    listOrders(restaurantId),
    listCategories(restaurantId),
    listDishes(restaurantId),
    listPrinters(restaurantId),
    getRestaurant(restaurantId),
  ]);

  return (
    <AppShell title="Kitchen Display">
      <KitchenClient
        orders={orders}
        categories={categories}
        dishes={dishes}
        printers={printers}
        timerLimitMinutes={restaurant?.kitchenTimerLimitMinutes ?? 30}
        openTime={restaurant?.openTime ?? null}
        defaultStation={session.displayStation ?? null}
      />
    </AppShell>
  );
}
