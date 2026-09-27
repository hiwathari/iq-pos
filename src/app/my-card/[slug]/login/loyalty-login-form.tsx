"use client";

import { requestLoyaltyMagicLinkAction, verifyLoginCodeAction } from "@/lib/actions/loyalty-auth";
import { LoyaltySignInForm } from "@/components/loyalty-sign-in-form";

export function LoyaltyLoginForm({ restaurantSlug }: { restaurantSlug: string }) {
  return (
    <LoyaltySignInForm
      description="Enter your email and we'll send you a sign-in link — no password needed."
      requestAction={requestLoyaltyMagicLinkAction.bind(null, restaurantSlug)}
      verifyAction={verifyLoginCodeAction.bind(null, restaurantSlug, "/my-card")}
    />
  );
}
