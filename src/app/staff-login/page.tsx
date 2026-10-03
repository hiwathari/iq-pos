import type { Metadata, Viewport } from "next";
import { staffPinLoginAction } from "@/lib/actions/pin-auth";
import { PinLoginForm } from "@/components/pin-login-form";
import { getRememberedDeviceRestaurantId } from "@/lib/auth";
import { getRestaurant } from "@/lib/data/restaurants";

export const metadata: Metadata = {
  title: "Staff Sign In",
};

export const viewport: Viewport = { themeColor: "#0d9488" };

export default async function StaffLoginPage() {
  const restaurantId = await getRememberedDeviceRestaurantId();
  const restaurant = restaurantId ? await getRestaurant(restaurantId) : null;

  return (
    <PinLoginForm
      action={staffPinLoginAction}
      title="Staff Sign In"
      subtitle="Enter your 6-digit staff code"
      restaurantName={restaurant?.name}
      restaurantLogoUrl={restaurant?.invoiceLogoUrl}
    />
  );
}
