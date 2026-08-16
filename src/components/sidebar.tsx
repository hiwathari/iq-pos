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
} from "lucide-react";
import { Logo } from "./logo";
import clsx from "clsx";
import { logoutAction } from "@/lib/actions/auth";
import type { Role } from "@/lib/session";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "staff"] as Role[] },
  { href: "/order-line", label: "Order Line", icon: ClipboardList, roles: ["admin", "staff"] as Role[] },
  { href: "/kitchen", label: "Kitchen Display", icon: KitchenIcon, roles: ["admin", "staff"] as Role[] },
  { href: "/manage-table", label: "Manage Table", icon: Table2, roles: ["admin", "staff"] as Role[] },
  { href: "/manage-dishes", label: "Manage Dishes", icon: ChefHat, roles: ["admin"] as Role[] },
  { href: "/pricing", label: "Channel Pricing", icon: Tags, roles: ["admin"] as Role[] },
  { href: "/customers", label: "Customers", icon: Users, roles: ["admin", "staff"] as Role[] },
  { href: "/reports", label: "Reports", icon: BarChart3, roles: ["admin"] as Role[] },
  { href: "/settings", label: "Settings", icon: Settings, roles: ["admin"] as Role[] },
  { href: "/help-center", label: "Help Center", icon: LifeBuoy, roles: ["admin", "staff"] as Role[] },
];

export function Sidebar({ role, name }: { role: Role; name: string }) {
  const pathname = usePathname();
  const items = role === "super_admin" ? [] : NAV.filter((item) => item.roles.includes(role));

  return (
    <aside className="hidden md:flex md:w-60 shrink-0 flex-col border-r border-neutral-200 bg-white px-4 py-5">
      <div className="px-2 mb-8">
        <Logo />
      </div>
      <nav className="flex-1 flex flex-col gap-1">
        {role === "super_admin" && (
          <Link
            href="/super-admin"
            className={clsx(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              pathname === "/super-admin"
                ? "bg-teal-600 text-white shadow-sm shadow-teal-200"
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
                  ? "bg-teal-600 text-white shadow-sm shadow-teal-200"
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
