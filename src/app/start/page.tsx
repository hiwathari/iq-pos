import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChefHat, LayoutDashboard, LogOut, ShoppingBag } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { logoutAction } from "@/lib/actions/auth";
import { getSession } from "@/lib/auth";
import { getRestaurant } from "@/lib/data/restaurants";
import { listPrinters } from "@/lib/data/printers";
import { businessProfile } from "@/lib/business-profile";
import { hasPermission } from "@/lib/permissions";
import { getUserPermissions, requireRestaurantContext } from "@/lib/scope";
import { hasKitchenDisplay } from "@/lib/types";

export const metadata: Metadata = { title: "Where to?" };

// After signing in with a username and password: choose the Till, the Dashboard or the Kitchen screen.
// A login that can only use one of them goes straight there.
export default async function StartPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin" && session.role !== "staff" && session.role !== "accounts") redirect("/");
  const { restaurantId } = await requireRestaurantContext();
  const [restaurant, printers, permissions] = await Promise.all([
    getRestaurant(restaurantId),
    listPrinters(restaurantId),
    session.role === "staff" ? getUserPermissions(session.userId) : Promise.resolve(null),
  ]);
  const profile = businessProfile(restaurant?.businessType, restaurant?.features);
  const kitchenAvailable = profile.features.kitchenDisplay && hasKitchenDisplay(printers);

  const choices = [
    hasPermission(session.role, permissions, "order-line") && { href: "/order-line", title: "Till", text: "Take orders and payments", icon: ShoppingBag },
    hasPermission(session.role, permissions, "dashboard") && { href: "/dashboard", title: "Dashboard", text: "Sales, reports and settings", icon: LayoutDashboard },
    kitchenAvailable && hasPermission(session.role, permissions, "kitchen") && { href: "/kitchen", title: "Kitchen screen", text: "Tickets for the kitchen and bar", icon: ChefHat },
  ].filter((c): c is { href: string; title: string; text: string; icon: typeof ShoppingBag } => !!c);

  if (choices.length === 1) redirect(choices[0].href);
  if (choices.length === 0) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <BrandLogo name={restaurant?.name} logoUrl={restaurant?.invoiceLogoUrl} />
        </div>
        <h1 className="text-center text-xl font-semibold text-neutral-900">Where to, {session.name.split(" ")[0]}?</h1>
        <p className="mb-6 mt-1 text-center text-sm text-neutral-500">Choose a screen. You can switch any time from the menu.</p>
        <div className="space-y-3">
          {choices.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="flex min-h-[84px] items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-teal-500 hover:shadow-md active:scale-[0.99]"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600 [&>svg]:size-6">
                <c.icon />
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-semibold text-neutral-900">{c.title}</span>
                <span className="block text-sm text-neutral-500">{c.text}</span>
              </span>
            </Link>
          ))}
        </div>
        <form action={logoutAction} className="mt-6 flex justify-center">
          <button type="submit" className="flex items-center gap-1.5 text-sm font-medium text-neutral-400 hover:text-neutral-700">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
