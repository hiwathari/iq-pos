"use client";

import { Bell, Search } from "lucide-react";
import type { Role } from "@/lib/session";

const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  staff: "Staff",
};

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function Topbar({ title, name, role }: { title?: string; name: string; role: Role }) {
  return (
    <header className="flex items-center gap-4 border-b border-neutral-200 bg-white px-6 py-4">
      <div className="relative flex-1 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
        <input
          type="text"
          placeholder="Search menu, orders and more"
          className="w-full rounded-xl border border-neutral-200 bg-neutral-50 py-2.5 pl-9 pr-4 text-sm text-neutral-700 placeholder:text-neutral-400 outline-none focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-100"
        />
      </div>
      {title ? <div className="hidden lg:block text-sm font-medium text-neutral-400">{title}</div> : null}
      <div className="flex flex-1 items-center justify-end gap-4">
        <button className="relative flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 text-neutral-500 hover:bg-neutral-50">
          <Bell className="h-[18px] w-[18px]" />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-rose-500" />
        </button>
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 text-sm font-semibold text-white">
            {initials(name) || "?"}
          </div>
          <div className="hidden sm:block leading-tight">
            <div className="text-sm font-semibold text-neutral-900">{name}</div>
            <div className="text-xs text-neutral-400">{ROLE_LABEL[role]}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
