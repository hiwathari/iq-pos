import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PrinterSetupGuide } from "@/components/printer-setup-guide";
import { listPrinters } from "@/lib/data/printers";
import { listAssignedRestaurantIds, listRestaurantsWithStats } from "@/lib/data/restaurants";
import { requireSession } from "@/lib/scope";
import { PrintersClient } from "@/app/settings/printers-client";
import { RestaurantPicker } from "./restaurant-picker";

// Super Admin → Printers: add and set up any restaurant's printers without signing in to it.
// Regional admins see only the restaurants assigned to them; the printer actions re-check that
// (printerScope in lib/actions/printers.ts), so a hand-edited ?restaurant= can't reach others.
export default async function SuperAdminPrintersPage({ searchParams }: PageProps<"/super-admin/printers">) {
  const session = await requireSession();
  if (session.role !== "super_admin" && session.role !== "regional_admin") redirect("/dashboard");

  const assignedIds = session.role === "super_admin" ? undefined : await listAssignedRestaurantIds(session.userId);
  const restaurants = (await listRestaurantsWithStats(assignedIds)).map((r) => ({ id: r.id, name: r.name, slug: r.slug, active: r.active }));
  const requested = (await searchParams).restaurant;
  const selected = restaurants.find((r) => r.id === requested) ?? restaurants[0] ?? null;
  const printers = selected ? await listPrinters(selected.id) : [];

  return (
    <AppShell title="Printers">
      <div className="space-y-8 p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-neutral-900">Printers</h1>
            <p className="mt-1 max-w-2xl text-sm text-neutral-500">
              Add a restaurant&apos;s printers and Kitchen Display screens, connect them to the Till, and get the setup scripts — without
              signing in to the restaurant.
            </p>
          </div>
          {restaurants.length > 0 && <RestaurantPicker restaurants={restaurants} selectedId={selected?.id ?? ""} />}
        </div>

        {selected ? (
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-5">
            <div className="mb-4 text-xs font-bold uppercase tracking-wide text-neutral-400">{selected.name}</div>
            <PrintersClient printers={printers} restaurantId={selected.id} />
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-neutral-300 py-12 text-center text-sm text-neutral-400">
            {session.role === "regional_admin" ? "No restaurants are assigned to you yet." : "No restaurants yet."}
          </div>
        )}

        <section>
          <h2 className="text-lg font-semibold text-neutral-900">Setup kit</h2>
          <p className="mb-4 mt-1 text-sm text-neutral-500">How to get a receipt or kitchen printer printing from the Till, with the scripts to do it.</p>
          <PrinterSetupGuide />
        </section>
      </div>
    </AppShell>
  );
}
