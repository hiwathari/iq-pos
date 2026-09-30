"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  Table2,
  ChefHat,
  Users,
  Settings,
  LifeBuoy,
  LogOut,
  ShieldCheck,
  ChefHat as KitchenIcon,
  BarChart3,
  Tags,
  TicketPercent,
  CreditCard,
  Package,
} from "lucide-react";
import { Logo } from "./logo";
import clsx from "clsx";
import { logoutAction } from "@/lib/actions/auth";
import type { Role } from "@/lib/session";
import { hasPermission, type PermissionKey } from "@/lib/permissions";

const NAV: { href: string; label: string; icon: typeof LayoutDashboard; key: PermissionKey }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, key: "dashboard" },
  { href: "/order-line", label: "Till", icon: ClipboardList, key: "order-line" },
  { href: "/kitchen", label: "Kitchen Display", icon: KitchenIcon, key: "kitchen" },
  { href: "/manage-table", label: "Manage Table", icon: Table2, key: "manage-table" },
  { href: "/manage-dishes", label: "Manage Dishes", icon: ChefHat, key: "manage-dishes" },
  { href: "/pricing", label: "Channel Pricing", icon: Tags, key: "pricing" },
  { href: "/coupons", label: "Coupons", icon: TicketPercent, key: "coupons" },
  { href: "/loyalty", label: "Loyalty Cards", icon: CreditCard, key: "loyalty" },
  { href: "/inventory", label: "Inventory", icon: Package, key: "inventory" },
  { href: "/customers", label: "Customers", icon: Users, key: "customers" },
  { href: "/reports", label: "Reports", icon: BarChart3, key: "reports" },
  { href: "/settings", label: "Settings", icon: Settings, key: "settings" },
  { href: "/help-center", label: "Help Center", icon: LifeBuoy, key: "help-center" },
];

export function Sidebar({
  role,
  name,
  permissions,
  isImpersonating,
}: {
  role: Role;
  name: string;
  permissions?: string[] | null;
  isImpersonating?: boolean;
}) {
  const pathname = usePathname();
  const isSuperOrRegional = role === "super_admin" || role === "regional_admin";
  // While impersonating, a super/regional admin operates with full access to that one
  // restaurant — same nav as its own admin would see — rather than the empty nav they'd
  // otherwise get since neither role is ever a page's own restaurantId owner.
  const effectiveRole: Role = isSuperOrRegional && isImpersonating ? "admin" : role;
  const items = isSuperOrRegional && !isImpersonating ? [] : NAV.filter((item) => hasPermission(effectiveRole, permissions, item.key));

  return (
    <aside className="hidden md:flex md:w-60 shrink-0 flex-col border-r border-neutral-200 bg-white px-4 py-5 print:hidden">
      <div className="px-2 mb-8">
        <Logo />
      </div>
      <nav className="flex-1 flex flex-col gap-1">
        {isSuperOrRegional && (
          <Link
            href="/super-admin"
            className={clsx(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              pathname === "/super-admin"
                ? "bg-[var(--brand)] text-white shadow-sm"
                : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
            )}
          >
            <ShieldCheck className="h-[18px] w-[18px]" strokeWidth={2} />
            Super Admin
          </Link>
        )}
        {items.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-[var(--brand)] text-white shadow-sm"
                  : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
              )}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-neutral-100 pt-3">
        <div className="mb-1 px-3 text-xs text-neutral-400">
          Signed in as <span className="font-medium text-neutral-600">{name}</span>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 transition-colors"
          >
            <LogOut className="h-[18px] w-[18px]" strokeWidth={2} />
            Logout
          </button>
        </form>
      </div>
    </aside>
  );
}
