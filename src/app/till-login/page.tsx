import type { Metadata, Viewport } from "next";
import { tillPinLoginAction } from "@/lib/actions/pin-auth";
import { PinLoginForm } from "@/components/pin-login-form";
import { getRememberedDeviceRestaurantId } from "@/lib/auth";
import { getRestaurant } from "@/lib/data/restaurants";

export const metadata: Metadata = {
  title: "Till",
  manifest: "/till-manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Till" },
  icons: { icon: "/api/pwa-icon/till?size=64", apple: "/api/pwa-icon/till?size=180" },
};

export const viewport: Viewport = { themeColor: "#0d9488" };

export default async function TillLoginPage() {
  const restaurantId = await getRememberedDeviceRestaurantId();
  const restaurant = restaurantId ? await getRestaurant(restaurantId) : null;

  return (
    <PinLoginForm
      action={tillPinLoginAction}
      title="Till Access"
      subtitle="Enter your 6-digit staff code"
      restaurantName={restaurant?.name}
      restaurantLogoUrl={restaurant?.invoiceLogoUrl}
    />
  );
}
