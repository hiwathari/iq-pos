import type { Metadata, Viewport } from "next";
import { staffPinLoginAction } from "@/lib/actions/pin-auth";
import { PinLoginForm } from "@/components/pin-login-form";

export const metadata: Metadata = {
  title: "Staff Sign In",
};

export const viewport: Viewport = { themeColor: "#0d9488" };

export default function StaffLoginPage() {
  return <PinLoginForm action={staffPinLoginAction} title="Staff Sign In" subtitle="Enter your 6-digit staff code" />;
}
