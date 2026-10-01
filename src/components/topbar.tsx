"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, Search } from "lucide-react";
import type { Role } from "@/lib/session";
import { formatOrderTimestamp } from "@/lib/types";
import { markAllNotificationsReadAction } from "@/lib/actions/notifications";

const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super Admin",
  regional_admin: "Regional Admin",
  admin: "Admin",
  staff: "Staff",
  till: "Till",
  kitchen_display: "Kitchen Display",
};

interface NotificationRow {
  id: string;
  title: string;
  body: string;
  link: string | null;
  createdAt: number;
  readAt: number | null;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function Topbar({
  title,
  name,
  role,
  notifications = [],
}: {
  title?: string;
  name: string;
  role: Role;
  notifications?: NotificationRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const hasUnread = notifications.some((n) => !n.readAt);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && hasUnread) {
      startTransition(async () => {
        await markAllNotificationsReadAction();
        router.refresh();
      });
    }
  }

  return (
    <header className="flex items-center gap-4 border-b border-neutral-200 bg-white px-6 py-4 print:hidden">
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
        <div className="relative">
          <button
            onClick={toggle}
            className="relative flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 text-neutral-500 hover:bg-neutral-50"
          >
            <Bell className="h-[18px] w-[18px]" />
            {hasUnread && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-rose-500" />}
          </button>
          {open && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
              <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-lg">
                <div className="border-b border-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-900">Notifications</div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 && <p className="px-4 py-6 text-center text-sm text-neutral-400">Nothing yet.</p>}
                  {notifications.map((n) => {
                    const content = (
                      <>
                        <div className="text-sm font-semibold text-neutral-900">{n.title}</div>
                        <div className="mt-0.5 text-xs text-neutral-500">{n.body}</div>
                        <div className="mt-1 text-[11px] text-neutral-400">{formatOrderTimestamp(n.createdAt)}</div>
                      </>
                    );
                    return n.link ? (
                      <Link
                        key={n.id}
                        href={n.link}
                        onClick={() => setOpen(false)}
                        className="block border-t border-neutral-50 px-4 py-3 first:border-t-0 hover:bg-neutral-50"
                      >
                        {content}
                      </Link>
                    ) : (
                      <div key={n.id} className="border-t border-neutral-50 px-4 py-3 first:border-t-0">
                        {content}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[var(--brand)] to-[var(--brand-dark)] text-sm font-semibold text-white">
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
