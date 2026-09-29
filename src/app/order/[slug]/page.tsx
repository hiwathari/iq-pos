import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getRestaurantBySlug } from "@/lib/data/restaurants";
import { listCategories, listDishes } from "@/lib/data/menu";
import { listTables } from "@/lib/data/tables";
import { findLoyaltyMemberById } from "@/lib/data/loyalty";
import type { RestaurantTable } from "@/lib/types";
import { LOYALTY_SESSION_COOKIE_NAME, verifyLoyaltySessionToken } from "@/lib/loyalty-session";
import { requestOnlineOrderSignInAction, verifyLoginCodeAction } from "@/lib/actions/loyalty-auth";
import { LoyaltySignInForm } from "@/components/loyalty-sign-in-form";
import { brandCssVars } from "@/lib/color";
import { Logo } from "@/components/logo";
import { OnlineOrderClient } from "./online-order-client";

export default async function OnlineOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ table?: string }>;
}) {
  const { slug } = await params;
  const { table: tableParam } = await searchParams;

  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) notFound();

  const brandStyle = brandCssVars(restaurant.brandColor);

  if (!restaurant.onlineOrderingEnabled) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4" style={brandStyle}>
        <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-7 text-center shadow-sm">
          <div className="mb-4 flex justify-center">
            <Logo />
          </div>
          <h1 className="mb-1 text-lg font-semibold text-neutral-900">Online ordering unavailable</h1>
          <p className="text-sm text-neutral-500">{restaurant.name} isn&apos;t taking online orders right now.</p>
        </div>
      </div>
    );
  }

  const redirectTo = `/order/${slug}${tableParam ? `?table=${encodeURIComponent(tableParam)}` : ""}`;

  const cookieStore = await cookies();
  const token = cookieStore.get(LOYALTY_SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifyLoyaltySessionToken(token) : null;
  const loyaltyMember = session && session.restaurantId === restaurant.id ? await findLoyaltyMemberById(restaurant.id, session.loyaltyMemberId) : null;

  if (!loyaltyMember) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4" style={brandStyle}>
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center">
            <Logo />
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-7 shadow-sm">
            <h1 className="mb-1 text-lg font-semibold text-neutral-900">Order from {restaurant.name}</h1>
            <LoyaltySignInForm
              description="Enter your email to sign in or create your account — no password needed."
              requestAction={requestOnlineOrderSignInAction.bind(null, slug, redirectTo)}
              verifyAction={verifyLoginCodeAction.bind(null, slug, redirectTo)}
            />
          </div>
        </div>
      </div>
    );
  }

  const [categories, dishes] = await Promise.all([listCategories(restaurant.id), listDishes(restaurant.id)]);

  let tables: RestaurantTable[] = [];
  let initialTableNumber: number | null = null;
  if (restaurant.qrTableOrderingEnabled) {
    tables = await listTables(restaurant.id);
    const parsed = tableParam ? Number(tableParam) : null;
    if (parsed && tables.some((t) => t.number === parsed)) initialTableNumber = parsed;
  }

  return (
    <div style={brandStyle}>
      <OnlineOrderClient
        restaurantSlug={slug}
        restaurantName={restaurant.name}
        currencySymbol={restaurant.currencySymbol}
        logoUrl={restaurant.invoiceLogoUrl}
        qrTableOrderingEnabled={restaurant.qrTableOrderingEnabled}
        categories={categories}
        dishes={dishes}
        tables={tables}
        initialTableNumber={initialTableNumber}
        loyaltyMember={{ code: loyaltyMember.code, name: loyaltyMember.name }}
      />
    </div>
  );
}
