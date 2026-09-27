import type { Metadata, Viewport } from "next";
import { tillPinLoginAction } from "@/lib/actions/pin-auth";
import { PinLoginForm } from "@/components/pin-login-form";

export const metadata: Metadata = {
  title: "Till",
  manifest: "/till-manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Till" },
  icons: { apple: "/api/pwa-icon/till?size=180" },
};

export const viewport: Viewport = { themeColor: "#0d9488" };

export default function TillLoginPage() {
  return <PinLoginForm action={tillPinLoginAction} title="Till Access" subtitle="Enter your 6-digit staff code" />;
}
