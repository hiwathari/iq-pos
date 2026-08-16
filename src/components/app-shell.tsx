"use client";

import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function AppShell({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-neutral-50">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={title} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
