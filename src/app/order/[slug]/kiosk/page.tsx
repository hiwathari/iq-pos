import { notFound } from "next/navigation";
import { getRestaurantBySlug } from "@/lib/data/restaurants";
import { listCategories, listDishes } from "@/lib/data/menu";
import { listTables } from "@/lib/data/tables";
import { brandCssVars } from "@/lib/color";
import { Logo } from "@/components/logo";
import { KioskClient } from "./kiosk-client";

export default async function KioskPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) notFound();

  const brandStyle = brandCssVars(restaurant.brandColor);

  if (!restaurant.onlineOrderingEnabled || !restaurant.kioskOrderingEnabled) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4" style={brandStyle}>
        <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-7 text-center shadow-sm">
          <div className="mb-4 flex justify-center">
            <Logo />
          </div>
          <h1 className="mb-1 text-lg font-semibold text-neutral-900">Kiosk unavailable</h1>
          <p className="text-sm text-neutral-500">{restaurant.name} isn&apos;t offering kiosk ordering right now.</p>
        </div>
      </div>
    );
  }

  const [categories, dishes, tables] = await Promise.all([
    listCategories(restaurant.id),
    listDishes(restaurant.id),
    restaurant.qrTableOrderingEnabled ? listTables(restaurant.id) : Promise.resolve([]),
  ]);

  return (
    <div style={brandStyle}>
      <KioskClient
        restaurantSlug={slug}
        restaurantName={restaurant.name}
        currencySymbol={restaurant.currencySymbol}
        logoUrl={restaurant.invoiceLogoUrl}
        qrTableOrderingEnabled={restaurant.qrTableOrderingEnabled}
        categories={categories}
        dishes={dishes}
        tables={tables}
      />
    </div>
  );
}
