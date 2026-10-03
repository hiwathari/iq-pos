import { getActiveRestaurantId, getImpersonatedRestaurantId, getSession } from "@/lib/auth";
import { getRestaurant } from "@/lib/data/restaurants";
import { listNotifications } from "@/lib/data/notifications";
import { getUserPermissions } from "@/lib/scope";
import { brandCssVars } from "@/lib/color";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { ImpersonationBanner } from "./impersonation-banner";
import { LockedShell } from "./locked-shell";

export async function AppShell({ children, title }: { children: React.ReactNode; title?: string }) {
  const session = await getSession();
  if (!session) return null;

  const activeRestaurantId = await getActiveRestaurantId(session);
  const restaurant = activeRestaurantId ? await getRestaurant(activeRestaurantId) : null;

  if (session.role === "till" || session.role === "kitchen_display") {
    const label = session.role === "till" ? `Till · ${session.name}` : "Kitchen Display";
    return (
      <LockedShell
        restaurantName={restaurant?.name}
        restaurantLogoUrl={restaurant?.invoiceLogoUrl}
        label={label}
        brandColor={restaurant?.brandColor}
      >
        {children}
      </LockedShell>
    );
  }

  const isImpersonating =
    (session.role === "super_admin" || session.role === "regional_admin") && Boolean(await getImpersonatedRestaurantId());
  const permissions = session.role === "staff" ? await getUserPermissions(session.userId) : null;
  // Payment-discrepancy alerts are for the restaurant's own admin, not staff — a super/regional
  // admin only sees them while impersonating (acting as that restaurant's admin), never on their
  // own cross-restaurant /super-admin view.
  const isEffectiveAdmin = session.role === "admin" || isImpersonating;
  const notifications = isEffectiveAdmin && restaurant ? await listNotifications(restaurant.id) : [];

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-neutral-50" style={brandCssVars(restaurant?.brandColor)}>
      <Sidebar
        role={session.role}
        name={session.name}
        permissions={permissions}
        isImpersonating={isImpersonating}
        restaurantName={restaurant?.name}
        restaurantLogoUrl={restaurant?.invoiceLogoUrl}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {isImpersonating && restaurant && (
          <ImpersonationBanner restaurantName={restaurant.name} label={session.role === "regional_admin" ? "Regional Admin" : "Super Admin"} />
        )}
        <Topbar
          title={restaurant ? `${title ?? ""}${title ? " · " : ""}${restaurant.name}` : title}
          name={session.name}
          role={session.role}
          notifications={notifications}
        />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
