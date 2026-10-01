import { LogOut } from "lucide-react";
import { logoutAction } from "@/lib/actions/auth";
import { brandCssVars } from "@/lib/color";

// Chrome for PIN-unlocked device sessions (till, kitchen display) — no sidebar, no nav,
// just the single screen the PIN grants access to and a way to lock it back up.
export function LockedShell({
  children,
  restaurantName,
  label,
  brandColor,
  endDaySection,
}: {
  children: React.ReactNode;
  restaurantName?: string;
  label: string;
  brandColor?: string | null;
  // Open Till / Report & End Day, for a till-login session only (never kitchen display) — the
  // whole point is that a PIN-only till device can run and close its own day without anyone
  // having to log into the full admin Dashboard, which this device can't reach at all.
  endDaySection?: React.ReactNode;
}) {
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-neutral-50" style={brandCssVars(brandColor)}>
      <header className="flex items-center justify-between gap-3 border-b border-neutral-200 bg-white px-5 py-3">
        <div className="text-sm font-semibold text-neutral-900">{restaurantName ?? "IQ POS"}</div>
        <div className="flex items-center gap-2">
          {endDaySection}
          <span className="hidden text-xs font-medium text-neutral-400 sm:inline">{label}</span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-500 hover:bg-neutral-50"
            >
              <LogOut className="h-3.5 w-3.5" /> Lock
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
