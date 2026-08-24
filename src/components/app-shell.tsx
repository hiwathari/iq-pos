import { getActiveRestaurantId, getImpersonatedRestaurantId, getSession } from "@/lib/auth";
import { getRestaurant } from "@/lib/data/restaurants";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { ImpersonationBanner } from "./impersonation-banner";

export async function AppShell({ children, title }: { children: React.ReactNode; title?: string }) {
  const session = await getSession();
  if (!session) return null;

  const activeRestaurantId = await getActiveRestaurantId(session);
  const restaurant = activeRestaurantId ? await getRestaurant(activeRestaurantId) : null;
  const isImpersonating = session.role === "super_admin" && Boolean(await getImpersonatedRestaurantId());

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-neutral-50">
      <Sidebar role={session.role} name={session.name} />
      <div className="flex min-w-0 flex-1 flex-col">
        {isImpersonating && restaurant && <ImpersonationBanner restaurantName={restaurant.name} />}
        <Topbar title={restaurant ? `${title ?? ""}${title ? " · " : ""}${restaurant.name}` : title} name={session.name} role={session.role} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
