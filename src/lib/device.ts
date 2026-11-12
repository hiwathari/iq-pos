// Where a signed-in person lands, by role and device. Plain module — used by the login action, the home
// page and the proxy.
import type { Role } from "@/lib/session";

// A phone (or the IQ POS Till Android app, whatever the screen size) goes straight into the Till.
// Tablets in a normal browser and computers get the "where to?" screen.
export function isPhoneOrTillApp(userAgent: string | null | undefined) {
  return /Mobi|iPhone|iPod|Android.+Mobile|IQPOSTill/i.test(userAgent ?? "");
}

export function landingFor(role: Role, userAgent: string | null | undefined) {
  if (role === "super_admin" || role === "regional_admin") return "/super-admin";
  if (role === "till") return "/order-line";
  if (role === "kitchen_display") return "/kitchen";
  if (role === "accounts") return "/dashboard";
  return isPhoneOrTillApp(userAgent) ? "/order-line" : "/start";
}
