"use client";

import { useEffect, useState } from "react";
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
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { BrandLogo } from "./brand-logo";
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

// Remembered per-browser (not per-user) so switching back to this device keeps the choice —
// collapsing to icons-only frees up width for the Till/Kitchen Display's own layout, which is
// cramped by a full-width sidebar sitting next to it when an admin/staff account (rather than a
// PIN till/kitchen login) opens those pages.
const COLLAPSE_KEY = "sidebar-collapsed";

export function Sidebar({
  role,
  name,
  permissions,
  isImpersonating,
  restaurantName,
  restaurantLogoUrl,
}: {
  role: Role;
  name: string;
  permissions?: string[] | null;
  isImpersonating?: boolean;
  restaurantName?: string | null;
  restaurantLogoUrl?: string | null;
}) {
  const pathname = usePathname();
  const isSuperOrRegional = role === "super_admin" || role === "regional_admin";
  // While impersonating, a super/regional admin operates with full access to that one
  // restaurant — same nav as its own admin would see — rather than the empty nav they'd
  // otherwise get since neither role is ever a page's own restaurantId owner.
  const effectiveRole: Role = isSuperOrRegional && isImpersonating ? "admin" : role;
  const items = isSuperOrRegional && !isImpersonating ? [] : NAV.filter((item) => hasPermission(effectiveRole, permissions, item.key));

  // Starts expanded (matches the server-rendered markup) and only collapses once mounted, so
  // there's never a server/client markup mismatch — just a brief flash open on page load for
  // someone who left it collapsed, same tradeoff the Till's mode-switcher already makes.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    let storedCollapsed = false;
    try {
      storedCollapsed = localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      // Storage unavailable — just stays expanded for this session.
    }
    // Deferred a tick so this doesn't set state synchronously within the effect body.
    if (storedCollapsed) setTimeout(() => setCollapsed(true), 0);
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // Ignore — the toggle still applies for this session even if it can't be remembered.
      }
      return next;
    });
  }

  const linkClass = (active: boolean) =>
    clsx(
      "flex items-center rounded-xl py-2.5 text-sm font-medium transition-colors",
      collapsed ? "justify-center px-0" : "gap-3 px-3",
      active ? "bg-[var(--brand)] text-white shadow-sm" : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
    );

  return (
    <aside
      className={clsx(
        "hidden md:flex shrink-0 flex-col border-r border-neutral-200 bg-white py-5 print:hidden transition-[width] duration-150",
        collapsed ? "md:w-[72px] px-2" : "md:w-60 px-4"
      )}
    >
      <div className={clsx("mb-8 flex items-center", collapsed ? "flex-col gap-3 px-0" : "justify-between px-2")}>
        <BrandLogo name={restaurantName} logoUrl={restaurantLogoUrl} showText={!collapsed} />
        <button
          onClick={toggleCollapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>
      <nav className="flex-1 flex flex-col gap-1">
        {isSuperOrRegional && (
          <Link
            href="/super-admin"
            prefetch={false}
            title={collapsed ? "Super Admin" : undefined}
            className={linkClass(pathname === "/super-admin")}
          >
            <ShieldCheck className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
            {!collapsed && "Super Admin"}
          </Link>
        )}
        {items.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              title={collapsed ? item.label : undefined}
              className={linkClass(active)}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
              {!collapsed && item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-neutral-100 pt-3">
        {!collapsed && (
          <div className="mb-1 px-3 text-xs text-neutral-400">
            Signed in as <span className="font-medium text-neutral-600">{name}</span>
          </div>
        )}
        <form action={logoutAction}>
          <button type="submit" title={collapsed ? "Logout" : undefined} className={clsx(linkClass(false), "w-full")}>
            <LogOut className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
            {!collapsed && "Logout"}
          </button>
        </form>
      </div>
    </aside>
  );
}
