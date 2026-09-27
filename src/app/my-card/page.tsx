import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders } from "@/db/schema";
import { LOYALTY_SESSION_COOKIE_NAME, verifyLoyaltySessionToken } from "@/lib/loyalty-session";
import { findLoyaltyMemberById } from "@/lib/data/loyalty";
import { getRestaurant } from "@/lib/data/restaurants";
import { formatMoney, formatOrderTimestamp, orderTotal } from "@/lib/types";
import { brandCssVars } from "@/lib/color";
import { loyaltyLogoutAction } from "@/lib/actions/loyalty-auth";
import { Logo } from "@/components/logo";
import { MyCardQr } from "./my-card-qr";

export default async function MyCardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(LOYALTY_SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifyLoyaltySessionToken(token) : null;
  if (!session) redirect("/my-card/signed-out");

  const [member, restaurant] = await Promise.all([
    findLoyaltyMemberById(session.restaurantId, session.loyaltyMemberId),
    getRestaurant(session.restaurantId),
  ]);
  if (!member || !restaurant) redirect("/my-card/signed-out");

  const memberOrders = await db
    .select()
    .from(orders)
    .where(and(eq(orders.loyaltyMemberId, member.id), eq(orders.restaurantId, session.restaurantId)))
    .orderBy(desc(orders.createdAt))
    .limit(20);

  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-10" style={brandCssVars(restaurant.brandColor)}>
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>

        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white text-center shadow-sm">
          <div className="h-2 bg-[var(--brand)]" />
          <div className="p-6">
            <p className="text-sm font-medium text-[var(--brand-dark)]">{restaurant.name} Loyalty Card</p>
            <h1 className="mt-1 text-lg font-semibold text-neutral-900">{member.name || member.contactValue}</h1>
            <MyCardQr code={member.code} />
            <div className="mt-3 font-mono text-xl font-bold tracking-wide text-[var(--brand-dark)]">{member.code}</div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Order History</h2>
          <div className="space-y-3">
            {memberOrders.map((o) => (
              <div key={o.id} className="flex items-center justify-between border-b border-neutral-100 pb-3 last:border-0 last:pb-0">
                <div>
                  <div className="text-sm font-medium text-neutral-800">#{o.orderNumber}</div>
                  <div className="text-xs text-neutral-400">{formatOrderTimestamp(o.createdAt)}</div>
                </div>
                <div className="text-sm font-semibold text-neutral-800">{formatMoney(orderTotal(o), restaurant.currencySymbol)}</div>
              </div>
            ))}
            {memberOrders.length === 0 && <p className="text-sm text-neutral-400">No orders yet.</p>}
          </div>
        </div>

        <form action={loyaltyLogoutAction} className="mt-6 text-center">
          <button type="submit" className="text-sm font-medium text-neutral-400 hover:text-neutral-600">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
