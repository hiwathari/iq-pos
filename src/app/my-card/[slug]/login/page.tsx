import { notFound } from "next/navigation";
import { Logo } from "@/components/logo";
import { getRestaurantBySlug } from "@/lib/data/restaurants";
import { brandCssVars } from "@/lib/color";
import { LoyaltyLoginForm } from "./loyalty-login-form";

export default async function LoyaltyLoginPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) notFound();

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4" style={brandCssVars(restaurant.brandColor)}>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-7 shadow-sm">
          <h1 className="mb-1 text-lg font-semibold text-neutral-900">{restaurant.name} Loyalty</h1>
          <p className="mb-6 text-sm text-neutral-500">Enter your email and we&apos;ll send you a sign-in link — no password needed.</p>
          <LoyaltyLoginForm restaurantSlug={slug} />
        </div>
      </div>
    </div>
  );
}
