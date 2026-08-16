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
} from "lucide-react";
import { Logo } from "./logo";
import clsx from "clsx";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/order-line", label: "Order Line", icon: ClipboardList },
  { href: "/manage-table", label: "Manage Table", icon: Table2 },
  { href: "/manage-dishes", label: "Manage Dishes", icon: ChefHat },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/help-center", label: "Help Center", icon: LifeBuoy },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:w-60 shrink-0 flex-col border-r border-neutral-200 bg-white px-4 py-5">
      <div className="px-2 mb-8">
        <Logo />
      </div>
      <nav className="flex-1 flex flex-col gap-1">
        {NAV.map((item) => {
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
      <button className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 transition-colors">
        <LogOut className="h-[18px] w-[18px]" strokeWidth={2} />
        Logout
      </button>
    </aside>
  );
}
