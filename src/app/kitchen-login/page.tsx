import type { Metadata, Viewport } from "next";
import { kitchenPinLoginAction } from "@/lib/actions/pin-auth";
import { PinLoginForm } from "@/components/pin-login-form";
import { getRememberedDeviceRestaurantId } from "@/lib/auth";
import { getRestaurant } from "@/lib/data/restaurants";

export const metadata: Metadata = {
  title: "Kitchen",
  manifest: "/kitchen-manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Kitchen" },
  icons: { icon: "/api/pwa-icon/kitchen?size=64", apple: "/api/pwa-icon/kitchen?size=180" },
};

export const viewport: Viewport = { themeColor: "#d97706" };

export default async function KitchenLoginPage() {
  const restaurantId = await getRememberedDeviceRestaurantId();
  const restaurant = restaurantId ? await getRestaurant(restaurantId) : null;

  return (
    <PinLoginForm
      action={kitchenPinLoginAction}
      title="Kitchen Display"
      subtitle="Enter the kitchen access code"
      restaurantName={restaurant?.name}
      restaurantLogoUrl={restaurant?.invoiceLogoUrl}
    />
  );
}
