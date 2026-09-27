import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/app-shell";
import { requireRestaurantContext } from "@/lib/scope";
import { listOrders } from "@/lib/data/orders";
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
  const { restaurantId } = await requireRestaurantContext();
  const [orders, restaurant] = await Promise.all([listOrders(restaurantId), getRestaurant(restaurantId)]);

  return (
    <AppShell title="Kitchen Display">
      <KitchenClient orders={orders} timerLimitMinutes={restaurant?.kitchenTimerLimitMinutes ?? 30} />
    </AppShell>
  );
}
