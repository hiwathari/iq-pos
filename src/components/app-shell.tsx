import { getActiveRestaurantId, getImpersonatedRestaurantId, getSession } from "@/lib/auth";
import { getRestaurant } from "@/lib/data/restaurants";
import { listPaymentTerminals } from "@/lib/data/printers";
import { getUserPermissions } from "@/lib/scope";
import { brandCssVars } from "@/lib/color";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { ImpersonationBanner } from "./impersonation-banner";
import { LockedShell } from "./locked-shell";
import { OpenTillButton } from "@/app/dashboard/open-till-button";
import { EndShiftButton } from "@/app/dashboard/end-shift-button";

export async function AppShell({ children, title }: { children: React.ReactNode; title?: string }) {
  const session = await getSession();
  if (!session) return null;

  const activeRestaurantId = await getActiveRestaurantId(session);
  const restaurant = activeRestaurantId ? await getRestaurant(activeRestaurantId) : null;

  if (session.role === "till" || session.role === "kitchen_display") {
    const label = session.role === "till" ? `Till · ${session.name}` : "Kitchen Display";
    const currencySymbol = restaurant?.currencySymbol ?? "£";
    const endDaySection =
      session.role === "till" && restaurant ? (
        <div className="flex items-center gap-2">
          <OpenTillButton
            currencySymbol={currencySymbol}
            pendingOpeningBalance={restaurant.pendingOpeningBalance}
            openingBalanceSetByName={restaurant.openingBalanceSetByName}
          />
          <EndShiftButton
            currencySymbol={currencySymbol}
            terminalNames={(await listPaymentTerminals(restaurant.id)).filter((t) => t.active).map((t) => t.name)}
          />
        </div>
      ) : null;
    return (
      <LockedShell restaurantName={restaurant?.name} label={label} brandColor={restaurant?.brandColor} endDaySection={endDaySection}>
        {children}
      </LockedShell>
    );
  }

  const isImpersonating =
    (session.role === "super_admin" || session.role === "regional_admin") && Boolean(await getImpersonatedRestaurantId());
  const permissions = session.role === "staff" ? await getUserPermissions(session.userId) : null;

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-neutral-50" style={brandCssVars(restaurant?.brandColor)}>
      <Sidebar role={session.role} name={session.name} permissions={permissions} isImpersonating={isImpersonating} />
      <div className="flex min-w-0 flex-1 flex-col">
        {isImpersonating && restaurant && (
          <ImpersonationBanner restaurantName={restaurant.name} label={session.role === "regional_admin" ? "Regional Admin" : "Super Admin"} />
        )}
        <Topbar title={restaurant ? `${title ?? ""}${title ? " · " : ""}${restaurant.name}` : title} name={session.name} role={session.role} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
