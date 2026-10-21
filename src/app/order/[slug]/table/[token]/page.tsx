import { notFound } from "next/navigation";
import { getRestaurantBySlug } from "@/lib/data/restaurants";
import { listCategories, listDishes } from "@/lib/data/menu";
import { resolveTableQrToken } from "@/lib/table-qr-token";
import { brandCssVars } from "@/lib/color";
import { Logo } from "@/components/logo";
import { OnlineOrderClient } from "../../online-order-client";

// Where a table's QR code lands (/order/<slug>/table/<signed token>, see lib/table-qr-token.ts).
// No sign-in step: the menu opens straight away with the table fixed by the token, and the
// customer just gives a name and email/phone at checkout (placeTableQrOrderAction).
export default async function TableQrOrderPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) notFound();

  const brandStyle = brandCssVars(restaurant.brandColor);
  const table = await resolveTableQrToken(decodeURIComponent(token));

  const message =
    !table || table.restaurantId !== restaurant.id
      ? { title: "This QR code isn't valid", body: "Please ask a member of staff to help you order." }
      : !restaurant.onlineOrderingEnabled || !restaurant.qrTableOrderingEnabled
        ? { title: "Table ordering unavailable", body: `${restaurant.name} isn't taking table orders right now — please order at the counter.` }
        : null;

  if (message || !table) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4" style={brandStyle}>
        <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-7 text-center shadow-sm">
          <div className="mb-4 flex justify-center">
            <Logo />
          </div>
          <h1 className="mb-1 text-lg font-semibold text-neutral-900">{message?.title}</h1>
          <p className="text-sm text-neutral-500">{message?.body}</p>
        </div>
      </div>
    );
  }

  const [categories, dishes] = await Promise.all([listCategories(restaurant.id), listDishes(restaurant.id)]);

  return (
    <div style={brandStyle}>
      <OnlineOrderClient
        restaurantSlug={slug}
        restaurantName={restaurant.name}
        currencySymbol={restaurant.currencySymbol}
        logoUrl={restaurant.invoiceLogoUrl}
        qrTableOrderingEnabled
        categories={categories}
        dishes={dishes}
        tables={[]}
        initialTableNumber={table.number}
        tableQr={{ token: decodeURIComponent(token), tableNumber: table.number }}
      />
    </div>
  );
}
