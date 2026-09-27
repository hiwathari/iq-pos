import type { Metadata, Viewport } from "next";
import { kitchenPinLoginAction } from "@/lib/actions/pin-auth";
import { PinLoginForm } from "@/components/pin-login-form";

export const metadata: Metadata = {
  title: "Kitchen",
  manifest: "/kitchen-manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Kitchen" },
  icons: { apple: "/api/pwa-icon/kitchen?size=180" },
};

export const viewport: Viewport = { themeColor: "#d97706" };

export default function KitchenLoginPage() {
  return <PinLoginForm action={kitchenPinLoginAction} title="Kitchen Display" subtitle="Enter the kitchen access code" />;
}
