import { LogOut } from "lucide-react";
import { logoutAction } from "@/lib/actions/auth";
import { brandCssVars } from "@/lib/color";

// Chrome for PIN-unlocked device sessions (till, kitchen display) — no sidebar, no nav,
// just the single screen the PIN grants access to and a way to lock it back up.
export function LockedShell({
  children,
  restaurantName,
  restaurantLogoUrl,
  label,
  brandColor,
}: {
  children: React.ReactNode;
  restaurantName?: string;
  restaurantLogoUrl?: string | null;
  label: string;
  brandColor?: string | null;
}) {
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-neutral-50" style={brandCssVars(brandColor)}>
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-5 py-3">
        <div className="flex items-center gap-2.5">
          {restaurantLogoUrl && <img src={restaurantLogoUrl} alt="" className="h-7 w-7 shrink-0 rounded-md object-contain" />}
          <div className="text-sm font-semibold text-neutral-900">{restaurantName ?? "IQ POS"}</div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-neutral-400">{label}</span>
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
