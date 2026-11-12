import { ChefHat, ShoppingBag } from "lucide-react";
import { startDeviceLoginAction } from "@/lib/actions/auth";

// Admin's Dashboard: switch this device to a PIN screen for the Till or the Kitchen Display. Staff
// never see the admin password screen — they only ever get the 6-digit PIN pad.
export function DeviceLogins({ showKitchen }: { showKitchen: boolean }) {
  return (
    <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-5 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-neutral-900">Set this device up for staff</h2>
        <p className="mt-0.5 text-sm text-neutral-500">
          Shows the PIN screen on this device and signs you out of it. Other devices can open{" "}
          <span className="font-medium text-neutral-700">/till-login</span>
          {showKitchen && (
            <>
              {" "}
              or <span className="font-medium text-neutral-700">/kitchen-login</span>
            </>
          )}{" "}
          directly.
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <form action={startDeviceLoginAction.bind(null, "till")}>
          <button type="submit" className="flex min-h-11 items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]">
            <ShoppingBag className="h-4 w-4" /> Till login (PIN)
          </button>
        </form>
        {showKitchen && (
          <form action={startDeviceLoginAction.bind(null, "kitchen")}>
            <button type="submit" className="flex min-h-11 items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">
              <ChefHat className="h-4 w-4" /> Kitchen display login (PIN)
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
